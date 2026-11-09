import assert from "node:assert/strict";
import test from "node:test";
import {
	FIN_LEN,
	findGaps,
	formatRanges,
	packFin,
	parseFin,
	parseRanges,
	rangeFrames,
} from "../static/tools/qr-share-twoway/app/fin.js";
import {
	LTDecoder,
	LTEncoder,
	blockLength,
	classifyFrame,
	cycleLength,
	packFrame,
} from "../static/tools/qr-share/app/vendor/decimen-core.js";

test("a FIN code survives a round trip", () => {
	const bytes = packFin({ sessionId: 4242, k: 2907, sweeps: 3 });
	assert.equal(bytes.length, FIN_LEN);
	assert.deepEqual(parseFin(bytes), { sessionId: 4242, k: 2907, sweeps: 3 });
});

test("a Decimen receiver files a FIN code under foreign and says nothing", () => {
	const bytes = packFin({ sessionId: 1, k: 10, sweeps: 1 });
	assert.deepEqual(classifyFrame(bytes), { kind: "foreign" });
});

test("a data frame is not a FIN code", () => {
	const frame = packFrame(
		{
			flags: 0,
			sessionId: 1,
			seq: 0,
			k: 1,
			blockLen: 4,
			totalLen: 4,
			payloadFnv: 0,
		},
		new Uint8Array(4),
	);
	assert.equal(parseFin(frame), null);
	assert.equal(parseFin(new Uint8Array(0)), null);
	assert.equal(parseFin(new Uint8Array(FIN_LEN)), null);
});

test("gaps come out longest first, then by position", () => {
	const solved = Array(20).fill(1);
	for (const i of [2, 3, 4, 10, 11, 17]) solved[i] = null;
	solved[19] = null;
	assert.deepEqual(findGaps(solved), [
		{ start: 2, count: 3 },
		{ start: 10, count: 2 },
		{ start: 17, count: 1 },
		{ start: 19, count: 1 },
	]);
	assert.equal(formatRanges(findGaps(solved), 2), "2/3/10/2");
	assert.deepEqual(findGaps(Array(5).fill(1)), []);
	assert.deepEqual(findGaps(Array(3).fill(null)), [{ start: 0, count: 3 }]);
});

test("ranges parse in pairs and are checked", () => {
	assert.deepEqual(parseRanges("120/30/300/6", 1000).ranges, [
		{ start: 120, count: 30 },
		{ start: 300, count: 6 },
	]);
	assert.deepEqual(parseRanges("990/50", 1000).ranges, [
		{ start: 990, count: 10 },
	]);
	for (const bad of [
		"",
		"120",
		"1/2/3",
		"a/b",
		"3-5",
		"1000/2",
		"5/0",
		"/",
		"1//2",
	])
		assert.ok(parseRanges(bad, 1000).error, `should reject "${bad}"`);
	assert.deepEqual(
		rangeFrames([
			{ start: 5, count: 3 },
			{ start: 9, count: 1 },
		]),
		[5, 6, 7, 9],
	);
});

function payload(size, seed) {
	const data = new Uint8Array(size);
	let x = seed;
	for (let i = 0; i < size; i++) {
		x ^= x << 13;
		x ^= x >>> 17;
		x ^= x << 5;
		data[i] = x & 255;
	}
	return data;
}

test("replaying the gaps a FIN code reports finishes the file sooner than waiting", () => {
	const blockLen = blockLength(1465);
	const data = payload(1 << 20, 321);
	const lose = (s) => s >= 600 && s < 630;

	const run = (replayGaps) => {
		const enc = new LTEncoder(data, blockLen, 77);
		const dec = new LTDecoder(enc.k, blockLen, 77, data.length);
		let sent = 0;
		for (let s = 0; s < enc.k; s++) {
			sent++;
			if (!lose(s)) dec.addFrame(s, enc.encode(s));
		}
		if (replayGaps) {
			// The receiver reads a FIN code here and works out what it lacks.
			const gaps = findGaps(dec.solved);
			assert.deepEqual(gaps, [{ start: 600, count: 30 }]);
			const parsed = parseRanges(formatRanges(gaps, 6), enc.k);
			for (const s of rangeFrames(parsed.ranges)) {
				sent++;
				dec.addFrame(s, enc.encode(s));
			}
		} else {
			for (let s = enc.k; !dec.isComplete && s < 8 * enc.k; s++) {
				sent++;
				dec.addFrame(s, enc.encode(s));
			}
		}
		assert.ok(dec.isComplete);
		assert.deepEqual(dec.assemble().subarray(0, data.length), data);
		return { sent, k: enc.k };
	};

	const waiting = run(false);
	const replay = run(true);
	assert.equal(replay.sent, replay.k + 30);
	assert.ok(
		replay.sent < waiting.sent,
		`${replay.sent} should beat ${waiting.sent}`,
	);
	assert.ok(cycleLength(replay.k) === 2 * replay.k);
	console.log(
		`k=${replay.k}: wait for repair frames=${waiting.sent}, replay gaps=${replay.sent}`,
	);
});
