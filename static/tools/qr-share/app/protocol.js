// Wire format and reassembly for the file transfer tool. No DOM access.
//
// Every code carries one frame: a header and a payload. The codec pads the rest.
// Header (13 bytes, big endian): type u8, transfer id u16, index u32, payload length u16, crc32 u32.
// The CRC covers the header (CRC field set to zero) and the payload.
// Index 0 is the metadata frame (JSON). Indexes 1..count are chunks of the zstd-compressed file.

import { GRIDS, capacity } from "./codec.js";
import { compress, decompress, init } from "./vendor/zstd.js";

export { GRIDS };
export const TYPE_META = 1;
export const TYPE_DATA = 2;
export const HEADER = 13;
const MAX_FRAMES = 1_000_000;
const MAX_SIZE = 2 ** 30; // zstd-wasm runs in 32-bit memory
const NAME_MAX = 96; // the metadata frame of the smallest grid must still fit
// shortcut: compression runs on the page thread. Level 12 takes about 0.5 s per 8 MiB,
// level 19 about 12 s. Move it to a worker before raising the level.
const ZSTD_LEVEL = 12;

// File bytes that one code carries.
export const payloadSize = (grid) => capacity(grid) - HEADER;

let zstdReady = null;
// Browsers call this without an argument, and zstd.wasm loads from next to zstd.js.
// Tests pass the bytes of the wasm file instead.
export function loadZstd(wasm) {
  zstdReady ??= init(wasm);
  return zstdReady;
}

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

export function encodeFrame(type, tid, index, payload) {
  const buf = new Uint8Array(HEADER + payload.length);
  const view = new DataView(buf.buffer);
  view.setUint8(0, type);
  view.setUint16(1, tid);
  view.setUint32(3, index);
  view.setUint16(7, payload.length);
  buf.set(payload, HEADER);
  view.setUint32(9, crc32(buf)); // CRC field is still zero while hashing
  return buf;
}

// Returns null for bytes that are not a valid frame (foreign code, damage, bad CRC).
// Bytes after the payload are padding and are ignored.
export function decodeFrame(bytes) {
  if (bytes.length < HEADER) return null;
  const len = new DataView(bytes.buffer, bytes.byteOffset).getUint16(7);
  if (HEADER + len > bytes.length) return null;
  const buf = bytes.slice(0, HEADER + len);
  const view = new DataView(buf.buffer);
  const crc = view.getUint32(9);
  view.setUint32(9, 0);
  if (crc32(buf) !== crc) return null;
  return {
    type: view.getUint8(0),
    tid: view.getUint16(1),
    index: view.getUint32(3),
    payload: buf.subarray(HEADER),
  };
}

// The size that a zstd frame announces in its header, or -1 when it announces none.
export function zstdContentSize(b) {
  if (
    b.length < 6 ||
    b[0] !== 0x28 ||
    b[1] !== 0xb5 ||
    b[2] !== 0x2f ||
    b[3] !== 0xfd
  )
    return -1;
  const flags = b[4];
  const single = (flags >> 5) & 1;
  const sizeBytes = flags >> 6 ? [0, 2, 4, 8][flags >> 6] : single;
  if (!sizeBytes) return -1;
  const at = 5 + (1 - single) + [0, 1, 2, 4][flags & 3];
  if (at + sizeBytes > b.length) return -1;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (sizeBytes === 1) return b[at];
  if (sizeBytes === 2) return view.getUint16(at, true) + 256;
  if (sizeBytes === 4) return view.getUint32(at, true);
  const n = view.getBigUint64(at, true);
  return n > BigInt(Number.MAX_SAFE_INTEGER) ? -1 : Number(n);
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

function shortName(name) {
  if (name.length <= NAME_MAX) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : "";
  return name.slice(0, NAME_MAX - ext.length) + ext;
}

export async function prepareTransfer(name, data, grid) {
  if (!GRIDS.includes(grid)) throw new Error("Unknown code size.");
  if (data.length > MAX_SIZE) throw new Error("The file is larger than 1 GiB.");
  await loadZstd();
  const packed = compress(data, ZSTD_LEVEL);
  const tid = crypto.getRandomValues(new Uint16Array(1))[0];
  const chunk = payloadSize(grid);
  const count = Math.max(1, Math.ceil(packed.length / chunk));
  const meta = {
    name: shortName(name),
    size: data.length,
    packed: packed.length,
    chunk,
    count,
    grid,
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
  for (let i = 0; i < count; i++)
    frames.push(
      encodeFrame(
        TYPE_DATA,
        tid,
        i + 1,
        packed.subarray(i * chunk, (i + 1) * chunk),
      ),
    );
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
    m.name.length <= NAME_MAX &&
    int(m.size, 0, MAX_SIZE) &&
    int(m.packed, 0, 2 ** 32) &&
    GRIDS.includes(m.grid) &&
    m.chunk === payloadSize(m.grid) &&
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
  feed(bytes) {
    const f = decodeFrame(bytes);
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
    // zstd-wasm sizes its output buffer from the frame header, so check it first.
    if (zstdContentSize(joined) !== size)
      throw new Error(
        "Compressed data does not announce the size in the metadata.",
      );
    await loadZstd();
    let bytes;
    try {
      bytes = decompress(joined);
    } catch {
      throw new Error("Decompression failed.");
    }
    if (bytes.length !== size)
      throw new Error("Decompressed size does not match the metadata.");
    return { name: name.replace(/[\\/]/g, "_") || "received.bin", bytes };
  }
}
