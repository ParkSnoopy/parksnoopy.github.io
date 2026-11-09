import assert from "node:assert/strict";
import test from "node:test";
import { classifyFrame } from "../static/tools/qr-share/app/vendor/decimen-core.js";
import {
	ACK_MAX_RUNS,
	findGaps,
	packAck,
	packMeta,
	parseAck,
	parseFin,
	parseMeta,
} from "../static/tools/qr-share-twoway/app/fin.js";

const sample = {
	sessionId: 9001,
	k: 2907,
	seq: 65535,
	solved: 2800,
	done: false,
	runs: [
		{ start: 120, count: 30 },
		{ start: 2900, count: 7 },
	],
};

test("an ACK code survives a round trip", () => {
	assert.deepEqual(parseAck(packAck(sample)), sample);
	const done = { ...sample, done: true, solved: 2907, runs: [] };
	assert.deepEqual(parseAck(packAck(done)), done);
});

test("a META code names the file and the stream", () => {
	const meta = {
		sessionId: 4711,
		k: 727,
		blockLen: 1443,
		size: 1048576,
		name: "report.pdf",
	};
	const bytes = packMeta(meta);
	assert.deepEqual(parseMeta(bytes), meta);
	assert.deepEqual(classifyFrame(bytes), { kind: "foreign" });
	assert.equal(parseAck(bytes), null);
	assert.equal(parseFin(bytes), null);
	assert.equal(parseMeta(packAck(sample)), null);
});

test("a long or non-Latin file name is cut on a character boundary", () => {
	const name = `${"보고서".repeat(30)}.pdf`;
	const meta = parseMeta(
		packMeta({ sessionId: 1, k: 2, blockLen: 100, size: 5, name }),
	);
	assert.ok(name.startsWith(meta.name));
	assert.ok(new TextEncoder().encode(meta.name).length <= 60);
	assert.ok(!meta.name.includes("\uFFFD"));
	assert.equal(
		parseMeta(
			packMeta({ sessionId: 1, k: 2, blockLen: 100, size: 5, name: "" }),
		).name,
		"",
	);
});

test("malformed META codes are refused", () => {
	const good = packMeta({
		sessionId: 1,
		k: 2,
		blockLen: 100,
		size: 5,
		name: "a",
	});
	assert.equal(parseMeta(good.subarray(0, good.length - 1)), null);
	assert.equal(parseMeta(new Uint8Array(13)), null);
	assert.equal(parseMeta(new Uint8Array(0)), null);
	assert.equal(
		parseMeta(
			packMeta({ sessionId: 1, k: 0, blockLen: 100, size: 5, name: "a" }),
		),
		null,
	);
});

test("an ACK code carries at most eight runs", () => {
	const runs = Array.from({ length: 20 }, (_, i) => ({
		start: i * 10,
		count: 3,
	}));
	assert.equal(
		parseAck(packAck({ ...sample, runs })).runs.length,
		ACK_MAX_RUNS,
	);
});

test("a Decimen receiver ignores an ACK code, and a FIN reader does not take it", () => {
	const bytes = packAck(sample);
	assert.deepEqual(classifyFrame(bytes), { kind: "foreign" });
	assert.equal(parseFin(bytes), null);
});

test("malformed ACK codes are refused", () => {
	const good = packAck(sample);
	assert.equal(parseAck(good.subarray(0, good.length - 1)), null);
	assert.equal(parseAck(new Uint8Array(12)), null);
	assert.equal(parseAck(new Uint8Array(0)), null);
	// A run that reaches past the last block.
	assert.equal(
		parseAck(packAck({ ...sample, runs: [{ start: 2905, count: 9 }] })),
		null,
	);
	assert.equal(
		parseAck(packAck({ ...sample, runs: [{ start: 5, count: 0 }] })),
		null,
	);
});

test("only blocks below the highest one seen are reported missing", () => {
	// The receiver has read blocks 0..9 except 3 and 4. Blocks 10 on are not sent yet.
	const solved = Array(40).fill(null);
	for (const i of [0, 1, 2, 5, 6, 7, 8, 9]) solved[i] = 1;
	const high = 9;
	assert.deepEqual(findGaps(solved.slice(0, high + 1)), [
		{ start: 3, count: 2 },
	]);
});
