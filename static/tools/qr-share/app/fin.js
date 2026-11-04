// The FIN code and the replay ranges. This file has no DOM access so Node can test it.
//
// A FIN code is a QR code the sender shows once every sweep of the file. A sweep sends
// each block of the file once, in order, so frame number n of a sweep is block n. The
// receiver reads a FIN code, lists the blocks it still lacks as ranges, and the user types
// the longest ones into the sender, which plays those frames again.
//
// The first byte is not the Decimen magic byte (0xD1), so a plain Decimen receiver files
// a FIN code under "foreign" and ignores it without a message.

export const FIN_MAGIC = 0xf1;
const FIN_VERSION = 1;
export const FIN_LEN = 7;

export function packFin({ sessionId, k, sweeps }) {
  const out = new Uint8Array(FIN_LEN);
  const dv = new DataView(out.buffer);
  dv.setUint8(0, FIN_MAGIC);
  dv.setUint8(1, FIN_VERSION);
  dv.setUint16(2, sessionId, true);
  dv.setUint16(4, k, true);
  dv.setUint8(6, Math.min(255, sweeps));
  return out;
}

// Returns null for anything that is not a FIN code of this version.
export function parseFin(bytes) {
  if (
    bytes.length !== FIN_LEN ||
    bytes[0] !== FIN_MAGIC ||
    bytes[1] !== FIN_VERSION
  )
    return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const k = dv.getUint16(4, true);
  if (k === 0) return null;
  return { sessionId: dv.getUint16(2, true), k, sweeps: dv.getUint8(6) };
}

// `solved` holds one entry per block, and null where the block is still missing.
// The result is sorted with the longest gap first.
export function findGaps(solved) {
  const gaps = [];
  let start = -1;
  for (let i = 0; i <= solved.length; i++) {
    const missing = i < solved.length && !solved[i];
    if (missing && start < 0) start = i;
    if (!missing && start >= 0) {
      gaps.push({ start, count: i - start });
      start = -1;
    }
  }
  return gaps.sort((a, b) => b.count - a.count || a.start - b.start);
}

// "120/30/300/6": block 120 and the 29 after it, then block 300 and the 5 after it.
export function formatRanges(gaps, limit) {
  return gaps
    .slice(0, limit)
    .map((g) => `${g.start}/${g.count}`)
    .join("/");
}

// Numbers with "/" between them, in pairs. Returns { ranges } or { error }.
export function parseRanges(text, k) {
  const parts = text.trim().split("/");
  if (
    parts.length === 0 ||
    parts.length % 2 !== 0 ||
    parts.some((p) => !/^\s*\d+\s*$/.test(p))
  )
    return {
      error: "Type pairs of numbers with / between them, such as 120/30/300/6.",
    };
  const ranges = [];
  for (let i = 0; i < parts.length; i += 2) {
    const start = Number(parts[i]);
    const count = Number(parts[i + 1]);
    if (start >= k)
      return {
        error: `Block ${start} does not exist. The file has blocks 0 to ${k - 1}.`,
      };
    if (count < 1) return { error: "Each count must be at least 1." };
    ranges.push({ start, count: Math.min(count, k - start) });
  }
  return { ranges };
}

export function rangeFrames(ranges) {
  const frames = [];
  for (const r of ranges)
    for (let i = 0; i < r.count; i++) frames.push(r.start + i);
  return frames;
}

// The META code is the first thing a sender shows, as soon as a file is chosen and before
// Start. It is one QR code that names the file, so the receiver can aim its camera at the
// screen and see what is coming. It carries no data. The session id is 0 here because the
// stream has not started. Its first byte is not the Decimen magic byte either, so a plain
// Decimen receiver ignores it.
export const META_MAGIC = 0xf3;
const META_VERSION = 1;
const META_HEAD = 13;
const META_NAME_MAX = 60; // bytes of UTF-8

export function packMeta({ sessionId, k, blockLen, size, name }) {
  let bytes = new TextEncoder().encode(name).subarray(0, META_NAME_MAX);
  // A cut can leave half a character at the end. Drop it.
  const text = new TextDecoder().decode(bytes).replace(/\uFFFD+$/u, "");
  bytes = new TextEncoder().encode(text);
  const out = new Uint8Array(META_HEAD + bytes.length);
  const dv = new DataView(out.buffer);
  dv.setUint8(0, META_MAGIC);
  dv.setUint8(1, META_VERSION);
  dv.setUint16(2, sessionId, true);
  dv.setUint16(4, k, true);
  dv.setUint16(6, blockLen, true);
  dv.setUint32(8, size, true);
  dv.setUint8(12, bytes.length);
  out.set(bytes, META_HEAD);
  return out;
}

// Returns null for anything that is not a well-formed META code of this version.
export function parseMeta(bytes) {
  if (
    bytes.length < META_HEAD ||
    bytes[0] !== META_MAGIC ||
    bytes[1] !== META_VERSION
  )
    return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = dv.getUint8(12);
  const k = dv.getUint16(4, true);
  if (k === 0 || bytes.length !== META_HEAD + n) return null;
  return {
    sessionId: dv.getUint16(2, true),
    k,
    blockLen: dv.getUint16(6, true),
    size: dv.getUint32(8, true),
    name: new TextDecoder().decode(bytes.subarray(META_HEAD)),
  };
}
