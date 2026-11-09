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

// The META code is the first thing a sender shows. It is one QR code that names the file
// and the stream, so a page that reads it knows what is coming and becomes the receiver.
// The data stream does not start until the receiver answers with an ACK code for the same
// session. Its first byte is not the Decimen magic byte either.
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

// The ACK code goes the other way. The receiver keeps one on its own screen while it
// works, and the sender's camera reads it. It says how far the receiver has got and which
// runs of blocks it lacks below the highest block it has seen, so the sender can replay
// them without anyone typing. Its first byte is not the Decimen magic byte either.
export const ACK_MAGIC = 0xf2;
const ACK_VERSION = 1;
const ACK_HEAD = 12;
export const ACK_MAX_RUNS = 8;

const FLAG_DONE = 1;

export function packAck({ sessionId, k, seq, solved, done, runs }) {
	const used = runs.slice(0, ACK_MAX_RUNS);
	const out = new Uint8Array(ACK_HEAD + 4 * used.length);
	const dv = new DataView(out.buffer);
	dv.setUint8(0, ACK_MAGIC);
	dv.setUint8(1, ACK_VERSION);
	dv.setUint16(2, sessionId, true);
	dv.setUint16(4, k, true);
	dv.setUint16(6, seq & 0xffff, true);
	dv.setUint16(8, solved, true);
	dv.setUint8(10, done ? FLAG_DONE : 0);
	dv.setUint8(11, used.length);
	used.forEach((r, i) => {
		dv.setUint16(ACK_HEAD + 4 * i, r.start, true);
		dv.setUint16(ACK_HEAD + 4 * i + 2, r.count, true);
	});
	return out;
}

// Returns null for anything that is not a well-formed ACK code of this version.
export function parseAck(bytes) {
	if (
		bytes.length < ACK_HEAD ||
		bytes[0] !== ACK_MAGIC ||
		bytes[1] !== ACK_VERSION
	)
		return null;
	const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const n = dv.getUint8(11);
	const k = dv.getUint16(4, true);
	const flags = dv.getUint8(10);
	if (k === 0 || n > ACK_MAX_RUNS || bytes.length !== ACK_HEAD + 4 * n)
		return null;
	const runs = [];
	for (let i = 0; i < n; i++) {
		const start = dv.getUint16(ACK_HEAD + 4 * i, true);
		const count = dv.getUint16(ACK_HEAD + 4 * i + 2, true);
		if (count < 1 || start + count > k) return null;
		runs.push({ start, count });
	}
	return {
		sessionId: dv.getUint16(2, true),
		k,
		seq: dv.getUint16(6, true),
		solved: dv.getUint16(8, true),
		done: (flags & FLAG_DONE) !== 0,
		runs,
	};
}

export function rangeFrames(ranges) {
	const frames = [];
	for (const r of ranges)
		for (let i = 0; i < r.count; i++) frames.push(r.start + i);
	return frames;
}
