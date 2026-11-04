import assert from "node:assert/strict";
import test from "node:test";
import { classifyFrame } from "../static/tools/qr-share/app/vendor/decimen-core.js";
import {
  ACK_MAX_RUNS,
  findGaps,
  packAck,
  packHello,
  parseAck,
  parseFin,
} from "../static/tools/qr-share/app/fin.js";

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
  assert.deepEqual(parseAck(packAck(sample)), { ...sample, hello: false });
  const done = { ...sample, done: true, solved: 2907, runs: [] };
  assert.deepEqual(parseAck(packAck(done)), { ...done, hello: false });
});

test("a HELLO code says a receiver is ready and nothing more", () => {
  const hello = parseAck(packHello(7));
  assert.deepEqual(hello, {
    sessionId: 0,
    k: 0,
    seq: 7,
    solved: 0,
    done: false,
    hello: true,
    runs: [],
  });
  assert.equal(parseAck(packAck(sample)).hello, false);
  assert.deepEqual(classifyFrame(packHello(1)), { kind: "foreign" });
  // k of zero is only valid for a HELLO.
  assert.equal(parseAck(packAck({ ...sample, k: 0, runs: [] })), null);
  assert.equal(parseAck(packAck({ ...sample, hello: true })), null);
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
