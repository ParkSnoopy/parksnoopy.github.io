// Test helper: shows a rendered code to a fake phone camera.
import { solveHomography } from "../static/tools/qr-share/app/codec.js";

let seed = 12345;
export const rnd = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return seed >>> 0;
};
export const randomBytes = (n) =>
  Uint8Array.from({ length: n }, () => rnd() & 255);

// Draws `img` into a camera frame through the quad `dst`, then adds a 3x3 blur,
// a color cast and noise, the way a phone camera would.
export function camera(
  img,
  { dst, gain = [1, 1, 1], offset = [0, 0, 0], noise = 0, w = 1280, h = 720 },
) {
  const src = [
    [0, 0],
    [img.width, 0],
    [img.width, img.height],
    [0, img.height],
  ];
  const inv = solveHomography(dst, src);
  const raw = new Float32Array(w * h * 3).fill(25);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const d = inv[6] * px + inv[7] * py + 1;
      const sx = (inv[0] * px + inv[1] * py + inv[2]) / d - 0.5;
      const sy = (inv[3] * px + inv[4] * py + inv[5]) / d - 0.5;
      if (sx < 0 || sy < 0 || sx >= img.width - 1 || sy >= img.height - 1)
        continue;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      for (let c = 0; c < 3; c++) {
        const at = (xx, yy) => img.data[(yy * img.width + xx) * 4 + c];
        raw[(y * w + x) * 3 + c] =
          at(x0, y0) * (1 - fx) * (1 - fy) +
          at(x0 + 1, y0) * fx * (1 - fy) +
          at(x0, y0 + 1) * (1 - fx) * fy +
          at(x0 + 1, y0 + 1) * fx * fy;
      }
    }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            sum += raw[(yy * w + xx) * 3 + c];
            n++;
          }
        out[(y * w + x) * 4 + c] =
          (sum / n) * gain[c] +
          offset[c] +
          (noise ? (rnd() % (2 * noise + 1)) - noise : 0);
      }
      out[(y * w + x) * 4 + 3] = 255;
    }
  return { data: out, width: w, height: h };
}

// A square code of `size` pixels, centered, tilted a little.
export const quad = (size, cx = 640, cy = 360, tilt = 0.04) => {
  const r = size / 2;
  const t = size * tilt;
  return [
    [cx - r + t, cy - r],
    [cx + r, cy - r + t],
    [cx + r - t, cy + r],
    [cx - r, cy + r - t],
  ];
};
