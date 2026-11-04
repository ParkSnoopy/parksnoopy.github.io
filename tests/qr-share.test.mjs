// Run from the repo root: node --test tests/qr-share.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, test } from "node:test";
import {
  Decoder,
  encodeCells,
  renderRGBA,
} from "../static/tools/qr-share/app/codec.js";
import {
  GRIDS,
  HEADER,
  Receiver,
  TYPE_DATA,
  decodeFrame,
  encodeFrame,
  formatMissing,
  loadZstd,
  parseMissing,
  payloadSize,
  prepareTransfer,
  zstdContentSize,
} from "../static/tools/qr-share/app/protocol.js";
import { camera, quad } from "./camera-sim.mjs";

before(() =>
  loadZstd(readFileSync("static/tools/qr-share/app/vendor/zstd.wasm")),
);

const sample = (n = 5_000) => {
  const data = new Uint8Array(n);
  let x = 123456789;
  for (let i = 0; i < data.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5; // xorshift32, hard to compress
    data[i] = x & 0xff;
  }
  return data;
};

test("payload size follows the grid", () => {
  const sizes = GRIDS.map(payloadSize);
  assert.deepEqual(
    sizes,
    [...sizes].sort((a, b) => a - b),
  );
  assert.ok(sizes[0] >= 600, "the metadata frame must fit the smallest grid");
});

test("frame round trip, padding and CRC rejection", () => {
  const frame = encodeFrame(TYPE_DATA, 0xabcd, 42, Uint8Array.of(1, 2, 3));
  assert.equal(frame.length, HEADER + 3);
  const padded = new Uint8Array(100);
  padded.set(frame);
  const f = decodeFrame(padded);
  assert.equal(f.tid, 0xabcd);
  assert.equal(f.index, 42);
  assert.deepEqual([...f.payload], [1, 2, 3]);
  const flipped = padded.slice();
  flipped[HEADER + 1] ^= 1;
  assert.equal(decodeFrame(flipped), null);
  assert.equal(decodeFrame(new Uint8Array(5)), null);
  assert.equal(decodeFrame(new Uint8Array(100)), null); // length 0 but wrong CRC
});

test("missing code format and parse", () => {
  assert.equal(formatMissing([9, 3, 4, 12]), "3/4/9/12");
  assert.deepEqual(parseMissing(" 9/3 /4//3/", 20), [3, 4, 9]);
  assert.throws(() => parseMissing("21", 20), /outside/);
  assert.throws(() => parseMissing("0", 20), /outside/);
  assert.throws(() => parseMissing("3-5", 20), /Cannot read/);
  assert.throws(() => parseMissing("", 20), /at least one/);
});

test("zstd frame header reports the content size", async () => {
  const { compress } =
    await import("../static/tools/qr-share/app/vendor/zstd.js");
  for (const n of [0, 1, 200, 300, 70_000, 3_000_000])
    assert.equal(
      zstdContentSize(compress(new Uint8Array(n), 3)),
      n,
      `size ${n}`,
    );
  assert.equal(zstdContentSize(Uint8Array.of(1, 2, 3, 4, 5, 6)), -1);
});

test("full transfer with lost frames, replay, and assembly", async () => {
  const data = sample();
  const { meta, frames } = await prepareTransfer("a/b.bin", data, 48);
  assert.ok(meta.count > 5);
  const rx = new Receiver();

  assert.equal(rx.feed(frames[0]), "meta");
  assert.equal(rx.feed(frames[0]), "duplicate");

  const lost = new Set([2, 3, meta.count]);
  for (let i = 1; i <= meta.count; i++)
    if (!lost.has(i)) assert.equal(rx.feed(frames[i]), "data");
  const damaged = frames[2].slice();
  damaged[20] ^= 0xff;
  assert.equal(rx.feed(damaged), "bad");
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

test("zstd shrinks compressible data", async () => {
  const { meta } = await prepareTransfer("z", new Uint8Array(100_000), 48);
  assert.ok(meta.packed < 100, `packed to ${meta.packed} bytes`);
});

test("long file names are shortened so the metadata frame fits", async () => {
  const name = `${"é".repeat(300)}.tar.gz`;
  const { meta, frames } = await prepareTransfer(name, sample(10), 48);
  assert.ok(meta.name.length <= 96 && meta.name.endsWith(".gz"));
  assert.ok(frames[0].length <= HEADER + payloadSize(48));
  assert.equal(new Receiver().feed(frames[0]), "meta");
});

test("foreign transfer and forged metadata are ignored", async () => {
  const a = await prepareTransfer("a", sample(), 48);
  const b = await prepareTransfer("b", sample(), 48);
  const rx = new Receiver();
  rx.feed(a.frames[0]);
  if (a.tid !== b.tid) assert.equal(rx.feed(b.frames[1]), "foreign");
  const forged = encodeFrame(1, 1, 0, new TextEncoder().encode('{"name":1}'));
  assert.equal(new Receiver().feed(forged), "bad");
});

test("data that fails the checksum is rejected", async () => {
  const { meta, frames } = await prepareTransfer("x", sample(), 48);
  const rx = new Receiver();
  rx.feed(frames[0]);
  for (let i = 1; i <= meta.count; i++) rx.feed(frames[i]);
  rx.meta.sha256 = "0".repeat(64);
  await assert.rejects(rx.assemble(), /Checksum/);
});

test("a size that differs from the zstd header is rejected before decompression", async () => {
  const { meta, frames } = await prepareTransfer(
    "z",
    new Uint8Array(100_000),
    48,
  );
  const rx = new Receiver();
  rx.feed(frames[0]);
  for (let i = 1; i <= meta.count; i++) rx.feed(frames[i]);
  rx.meta.size = 10;
  await assert.rejects(rx.assemble(), /announce/);
});

test("frames survive the whole path: encode, screen, camera, decode", async () => {
  const data = sample(3_000);
  const { meta, frames } = await prepareTransfer("cam.bin", data, 48);
  const dec = new Decoder();
  const rx = new Receiver();
  for (const [i, frame] of frames.entries()) {
    const shown = renderRGBA(encodeCells(frame, meta.grid), meta.grid, 5);
    const view = camera(shown, {
      dst: quad(380, 480, 270),
      gain: [0.85, 0.9, 0.8],
      offset: [15, 10, 20],
      noise: 10,
      w: 960,
      h: 540,
    });
    const got = dec.decode(view);
    assert.ok(got, `frame ${i} not read`);
    assert.notEqual(rx.feed(got.bytes), "bad", `frame ${i} rejected`);
  }
  assert.equal(rx.complete(), true);
  assert.deepEqual((await rx.assemble()).bytes, data);
});
