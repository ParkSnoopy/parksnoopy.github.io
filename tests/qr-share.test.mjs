// Run from the repo root: node --test tests/qr-share.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import {
  MAX_CHUNK,
  Receiver,
  decodeFrame,
  encodeFrame,
  formatMissing,
  parseMissing,
  prepareTransfer,
  TYPE_DATA,
} from "../static/tools/qr-share/app/protocol.js";

const sample = () => {
  const data = new Uint8Array(5_000);
  let x = 123456789;
  for (let i = 0; i < data.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5; // xorshift32, hard to compress
    data[i] = x & 0xff;
  }
  return data;
};

test("MAX_CHUNK is the largest payload that fits in one QR code", async () => {
  const ctx = {};
  vm.runInNewContext(
    `${readFileSync("static/tools/qr-share/app/vendor/qrcode.js", "utf8")};this.qrcode=qrcode`,
    ctx,
  );
  const fits = (n) => {
    const qr = ctx.qrcode(0, "M");
    qr.addData(encodeFrame(TYPE_DATA, 1, 1, new Uint8Array(n)), "Byte");
    qr.make();
  };
  assert.doesNotThrow(() => fits(MAX_CHUNK));
  assert.throws(() => fits(MAX_CHUNK + 1));
});

test("frame round trip and CRC rejection", () => {
  const text = encodeFrame(TYPE_DATA, 0xabcd, 42, Uint8Array.of(1, 2, 3));
  const f = decodeFrame(text);
  assert.equal(f.tid, 0xabcd);
  assert.equal(f.index, 42);
  assert.deepEqual([...f.payload], [1, 2, 3]);
  const flipped =
    text.slice(0, 20) + (text[20] === "A" ? "B" : "A") + text.slice(21);
  assert.equal(decodeFrame(flipped), null);
  assert.equal(decodeFrame("not a frame"), null);
});

test("missing code format and parse", () => {
  assert.equal(formatMissing([9, 3, 4, 12]), "3/4/9/12");
  assert.deepEqual(parseMissing(" 9/3 /4//3/", 20), [3, 4, 9]);
  assert.throws(() => parseMissing("21", 20), /outside/);
  assert.throws(() => parseMissing("0", 20), /outside/);
  assert.throws(() => parseMissing("3-5", 20), /Cannot read/);
  assert.throws(() => parseMissing("", 20), /at least one/);
});

test("full transfer with lost frames, replay, and assembly", async () => {
  const data = sample();
  const { meta, frames } = await prepareTransfer("a/b.bin", data, 100);
  assert.ok(meta.count > 5);
  const rx = new Receiver();

  assert.equal(rx.feed(frames[0]), "meta");
  assert.equal(rx.feed(frames[0]), "duplicate");

  const lost = new Set([2, 3, meta.count]);
  for (let i = 1; i <= meta.count; i++)
    if (!lost.has(i)) assert.equal(rx.feed(frames[i]), "data");
  assert.equal(rx.feed(`${frames[2].slice(0, 30)}!!`), "bad"); // damaged frame
  assert.equal(rx.feed(frames[0]), "pass-end");
  assert.equal(rx.ended, true);
  assert.equal(rx.complete(), false);
  assert.equal(rx.missingCode(), formatMissing([2, 3, meta.count]));
  await assert.rejects(rx.assemble(), /missing/);

  for (const i of parseMissing(rx.missingCode(), meta.count))
    rx.feed(frames[i]);
  assert.equal(rx.complete(), true);
  const out = await rx.assemble();
  assert.equal(out.name, "a_b.bin");
  assert.deepEqual(out.bytes, data);
});

test("foreign transfer and forged metadata are ignored", async () => {
  const a = await prepareTransfer("a", sample(), 100);
  const b = await prepareTransfer("b", sample(), 100);
  const rx = new Receiver();
  rx.feed(a.frames[0]);
  if (a.tid !== b.tid) assert.equal(rx.feed(b.frames[1]), "foreign");
  const forged = encodeFrame(1, 1, 0, new TextEncoder().encode('{"name":1}'));
  assert.equal(new Receiver().feed(forged), "bad");
});

test("data that fails the checksum is rejected", async () => {
  const { meta, frames } = await prepareTransfer("x", sample(), 100);
  const rx = new Receiver();
  rx.feed(frames[0]);
  for (let i = 1; i <= meta.count; i++) rx.feed(frames[i]);
  rx.meta.sha256 = "0".repeat(64);
  await assert.rejects(rx.assemble(), /Checksum/);
});

test("decompression bomb is cut off at the announced size", async () => {
  const { meta, frames } = await prepareTransfer(
    "z",
    new Uint8Array(100_000),
    100,
  );
  const rx = new Receiver();
  rx.feed(frames[0]);
  for (let i = 1; i <= meta.count; i++) rx.feed(frames[i]);
  rx.meta.size = 10;
  await assert.rejects(rx.assemble(), /larger than announced/);
});
