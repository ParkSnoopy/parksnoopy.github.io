// Wire format and reassembly for the QR file transfer tool. No DOM access.
//
// Every QR code carries one frame: base64( header + payload ).
// Header (11 bytes, big endian): type u8, transfer id u16, index u32, crc32 u32.
// The CRC covers the whole frame with the CRC field set to zero.
// Index 0 is the metadata frame (JSON). Indexes 1..count are gzip data chunks.

export const TYPE_META = 1;
export const TYPE_DATA = 2;
const HEADER = 11;

// A frame is base64 text (4 chars per 3 bytes) in one QR code. QR version 40 at
// error level M holds 2331 bytes, so the largest payload is the biggest 3-byte
// multiple that fits, minus the header.
const QR_CAPACITY = 2331;
export const MAX_CHUNK = Math.floor(QR_CAPACITY / 4) * 3 - HEADER;
const MAX_FRAMES = 1_000_000;

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function fromBase64(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function encodeFrame(type, tid, index, payload) {
  const buf = new Uint8Array(HEADER + payload.length);
  const view = new DataView(buf.buffer);
  view.setUint8(0, type);
  view.setUint16(1, tid);
  view.setUint32(3, index);
  buf.set(payload, HEADER);
  view.setUint32(7, crc32(buf)); // CRC field is still zero while hashing
  return toBase64(buf);
}

// Returns null for text that is not a valid frame (foreign QR, bad base64, bad CRC).
export function decodeFrame(text) {
  let buf;
  try {
    buf = fromBase64(text.trim());
  } catch {
    return null;
  }
  if (buf.length < HEADER) return null;
  const view = new DataView(buf.buffer);
  const crc = view.getUint32(7);
  view.setUint32(7, 0);
  if (crc32(buf) !== crc) return null;
  return {
    type: view.getUint8(0),
    tid: view.getUint16(1),
    index: view.getUint32(3),
    payload: buf.subarray(HEADER),
  };
}

export async function gzip(bytes) {
  const out = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(out).arrayBuffer());
}

// Stops reading once the output passes `limit`, so a hostile stream cannot fill memory.
export async function gunzip(bytes, limit) {
  const reader = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error("Decompressed data is larger than announced.");
    }
    chunks.push(value);
  }
  return concat(chunks, total);
}

function concat(chunks, total) {
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function prepareTransfer(name, data, chunkSize) {
  const packed = await gzip(data);
  const tid = crypto.getRandomValues(new Uint16Array(1))[0];
  const count = Math.max(1, Math.ceil(packed.length / chunkSize));
  const meta = {
    name,
    size: data.length,
    packed: packed.length,
    chunk: chunkSize,
    count,
    sha256: await sha256Hex(packed),
  };
  const frames = [
    encodeFrame(
      TYPE_META,
      tid,
      0,
      new TextEncoder().encode(JSON.stringify(meta)),
    ),
  ];
  for (let i = 0; i < count; i++) {
    frames.push(
      encodeFrame(
        TYPE_DATA,
        tid,
        i + 1,
        packed.subarray(i * chunkSize, (i + 1) * chunkSize),
      ),
    );
  }
  return { tid, meta, frames };
}

// Missing indexes become digits joined by "/", easy to read aloud and type: "3/4/5/9".
export function formatMissing(indexes) {
  return [...indexes].sort((a, b) => a - b).join("/");
}

export function parseMissing(code, count) {
  const out = new Set();
  for (const token of code.replace(/\s+/g, "").split("/").filter(Boolean)) {
    if (!/^\d+$/.test(token)) throw new Error(`Cannot read "${token}".`);
    const n = Number(token);
    if (n < 1 || n > count)
      throw new Error(`Number ${token} is outside 1-${count}.`);
    out.add(n);
  }
  if (out.size === 0) throw new Error("Enter at least one number.");
  return [...out].sort((a, b) => a - b);
}

function validMeta(m) {
  const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  return (
    m &&
    typeof m.name === "string" &&
    m.name.length <= 255 &&
    int(m.size, 0, 2 ** 32) &&
    int(m.packed, 0, 2 ** 32) &&
    int(m.chunk, 1, 1 << 20) &&
    int(m.count, 1, MAX_FRAMES) &&
    m.count === Math.max(1, Math.ceil(m.packed / m.chunk)) &&
    typeof m.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(m.sha256)
  );
}

export class Receiver {
  constructor() {
    this.reset();
  }

  reset() {
    this.tid = null;
    this.meta = null;
    this.parts = new Map();
    this.bad = 0; // frames that were unreadable or failed their CRC
    this.ended = false; // the sender went back to the metadata frame after a pass
  }

  get received() {
    return this.parts.size;
  }

  get total() {
    return this.meta ? this.meta.count : 0;
  }

  complete() {
    return this.meta !== null && this.parts.size === this.meta.count;
  }

  missing() {
    const out = [];
    for (let i = 1; i <= this.total; i++) if (!this.parts.has(i)) out.push(i);
    return out;
  }

  missingCode() {
    return formatMissing(this.missing());
  }

  // Returns one of: "meta", "data", "pass-end", "duplicate", "foreign", "bad".
  feed(text) {
    const f = decodeFrame(text);
    if (!f) {
      if (this.meta) this.bad++;
      return "bad";
    }
    if (f.type === TYPE_META) {
      if (!this.meta) {
        let meta;
        try {
          meta = JSON.parse(new TextDecoder().decode(f.payload));
        } catch {
          return "bad";
        }
        if (!validMeta(meta)) return "bad";
        this.tid = f.tid;
        this.meta = meta;
        return "meta";
      }
      if (f.tid !== this.tid) return "foreign";
      if (this.parts.size === 0) return "duplicate";
      this.ended = true;
      return "pass-end";
    }
    if (f.type !== TYPE_DATA || !this.meta) return "bad";
    if (f.tid !== this.tid) return "foreign";
    if (f.index < 1 || f.index > this.meta.count) return "bad";
    if (this.parts.has(f.index)) return "duplicate";
    this.parts.set(f.index, f.payload.slice());
    this.ended = false;
    return "data";
  }

  // Joins the chunks, checks length and SHA-256, then decompresses.
  async assemble() {
    if (!this.complete()) throw new Error("Frames are still missing.");
    const { name, size, packed, sha256 } = this.meta;
    const chunks = [...this.parts.keys()]
      .sort((a, b) => a - b)
      .map((i) => this.parts.get(i));
    if (chunks.reduce((n, c) => n + c.length, 0) !== packed)
      throw new Error("Data length does not match the metadata.");
    const joined = concat(chunks, packed);
    if ((await sha256Hex(joined)) !== sha256)
      throw new Error("Checksum mismatch. Reset and send again.");
    const bytes = await gunzip(joined, size);
    if (bytes.length !== size)
      throw new Error("Decompressed size does not match the metadata.");
    return { name: name.replace(/[\\/]/g, "_") || "received.bin", bytes };
  }
}
