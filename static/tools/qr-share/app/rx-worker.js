// Decodes camera images off the page thread, so the page never makes the camera wait.
// In: { type: "grid", grid } or { type: "frame", bitmap }.
// Out: { type: "result", bytes, grid, fixed, ms } for every frame. bytes is null when no code was read.
import { Decoder } from "./codec.js";

const decoder = new Decoder();
let canvas = null;
let ctx = null;

self.onmessage = ({ data }) => {
  if (data.type === "grid") {
    decoder.setGrid(data.grid);
    return;
  }
  const t0 = performance.now();
  const { bitmap } = data;
  if (
    !canvas ||
    canvas.width !== bitmap.width ||
    canvas.height !== bitmap.height
  ) {
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const out = decoder.decode(
    ctx.getImageData(0, 0, canvas.width, canvas.height),
  );
  self.postMessage(
    {
      type: "result",
      bytes: out ? out.bytes : null,
      grid: out ? out.grid : 0,
      fixed: out ? out.fixed : 0,
      ms: performance.now() - t0,
    },
    out ? [out.bytes.buffer] : [],
  );
};
