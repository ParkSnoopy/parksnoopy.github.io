// Run from the repo root: node --test tests/codec.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Decoder,
  GRIDS,
  capacity,
  encodeCells,
  renderRGBA,
  rsDecode,
  rsEncode,
} from "../static/tools/qr-share/app/codec.js";
import { camera, randomBytes, rnd } from "./camera-sim.mjs";

test("reed-solomon repairs up to 16 wrong bytes", () => {
  for (let round = 0; round < 40; round++) {
    const data = randomBytes(1 + (rnd() % 223));
    const word = rsEncode(data);
    const bad = word.slice();
    const errors = 1 + (rnd() % 16);
    const hit = new Set();
    while (hit.size < errors) hit.add(rnd() % bad.length);
    for (const i of hit) bad[i] ^= 1 + (rnd() % 255);
    assert.equal(rsDecode(bad), errors);
    assert.deepEqual(bad, word);
  }
});

test("reed-solomon gives up on more than 16 wrong bytes", () => {
  const word = rsEncode(randomBytes(200));
  const bad = word.slice();
  for (let i = 0; i < 40; i++) bad[i * 5] ^= 0x55;
  const fixed = rsDecode(bad);
  assert.ok(fixed === -1 || bad.some((v, i) => v !== word[i]));
});

test("capacity grows with the grid", () => {
  const caps = GRIDS.map(capacity);
  console.log(
    "capacity per grid:",
    GRIDS.map((g, i) => `${g}=${caps[i]}`).join(" "),
  );
  assert.deepEqual(
    caps,
    [...caps].sort((a, b) => a - b),
  );
  assert.ok(caps[0] >= 600);
});

test("every grid size round-trips through a clean image", () => {
  for (const G of GRIDS) {
    const frame = randomBytes(capacity(G));
    const img = renderRGBA(encodeCells(frame, G), G, 5);
    const out = new Decoder().decode(img);
    assert.ok(out, `grid ${G} not decoded`);
    assert.equal(out.grid, G);
    assert.deepEqual(out.bytes, frame);
    assert.equal(out.fixed, 0);
  }
});

test("camera view: tilt, color cast, noise and a rotated code", () => {
  const G = 64;
  const frame = randomBytes(capacity(G));
  const img = renderRGBA(encodeCells(frame, G), G, 5);
  const quads = [
    [
      [250, 70],
      [1010, 110],
      [980, 650],
      [270, 620],
    ],
    [
      [980, 650],
      [270, 620],
      [250, 70],
      [1010, 110],
    ], // turned half way round
    [
      [1010, 110],
      [980, 650],
      [270, 620],
      [250, 70],
    ], // turned a quarter
  ];
  for (const dst of quads) {
    const frameImg = camera(img, {
      dst,
      gain: [0.8, 0.9, 0.7],
      offset: [20, 10, 25],
      noise: 12,
    });
    const out = new Decoder().decode(frameImg);
    assert.ok(out, "code not found");
    assert.deepEqual(out.bytes, frame);
  }
});

test("a known grid is decoded and the position is tracked", () => {
  const G = 96;
  const frame = randomBytes(capacity(G));
  const img = renderRGBA(encodeCells(frame, G), G, 5);
  const view = camera(img, {
    dst: [
      [300, 40],
      [980, 60],
      [960, 690],
      [320, 670],
    ],
    noise: 8,
  });
  const dec = new Decoder();
  dec.setGrid(G);
  assert.deepEqual(dec.decode(view)?.bytes, frame);
  const t0 = performance.now();
  const runs = 20;
  for (let i = 0; i < runs; i++)
    assert.deepEqual(dec.decode(view).bytes, frame);
  const ms = (performance.now() - t0) / runs;
  console.log(
    `tracked decode of a 1280x720 frame, grid ${G}: ${ms.toFixed(1)} ms`,
  );
  assert.ok(ms < 33, "slower than one 30 fps frame");
});

test("a frame torn in two is rejected, not misread", () => {
  const G = 64;
  const a = randomBytes(capacity(G));
  const b = randomBytes(capacity(G));
  const top = renderRGBA(encodeCells(a, G), G, 5);
  const low = renderRGBA(encodeCells(b, G), G, 5);
  const half = (top.width * top.height * 4) / 2;
  top.data.set(low.data.subarray(half), half);
  assert.equal(new Decoder().decode(top), null);
});

test("an empty camera view finds nothing", () => {
  const data = new Uint8ClampedArray(640 * 480 * 4).fill(40);
  assert.equal(new Decoder().decode({ data, width: 640, height: 480 }), null);
});
