// Dense color code for the screen-to-camera file transfer. No DOM access.
//
// A code is a G x G grid of square cells inside a white quiet zone. A cell shows one of
// 8 colors, the corners of the RGB cube, so it carries 3 bits.
// Four 7x7 finder patterns (the 1:1:3:1:1 shape known from QR codes) sit in the
// corners. They locate the grid and give a black and a white reference for every
// color channel, so the decoder needs no fixed lighting.
// The frame bytes are split into Reed-Solomon blocks (32 parity bytes each),
// interleaved, whitened with a fixed key stream, and written into the data cells.

export const GRIDS = [48, 64, 80, 96, 112, 128];
const QUIET = 4; // white cells around the grid
const ZONE = 8; // finder 7 cells + 1 separator cell
const FINDER = 7;
const SYNC = [2, 5, 1, 6, 3, 4, 7, 0]; // row 0, from column 8: tells rotation and grid size
const SYNC_COL = 8;
const PARITY = 32;
const MIN_CONTRAST = 40; // white minus black, per channel, on a 0-255 scale

// ---------- Reed-Solomon over GF(256), polynomial 0x11d, roots alpha^0..alpha^31 ----------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
const div = (a, b) => (a ? EXP[LOG[a] + 255 - LOG[b]] : 0);

const GEN = (() => {
  let g = [1];
  for (let i = 0; i < PARITY; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = next;
  }
  return Uint8Array.from(g);
})();

export function rsEncode(data) {
  const out = new Uint8Array(data.length + PARITY);
  out.set(data);
  for (let i = 0; i < data.length; i++) {
    const c = out[i];
    if (c) for (let j = 1; j <= PARITY; j++) out[i + j] ^= mul(GEN[j], c);
  }
  out.set(data); // the loop left the quotient in the data positions
  return out;
}

function syndromes(cw) {
  const syn = new Uint8Array(PARITY);
  let dirty = false;
  for (let j = 0; j < PARITY; j++) {
    let s = 0;
    for (let i = 0; i < cw.length; i++) s = (s ? EXP[LOG[s] + j] : 0) ^ cw[i];
    syn[j] = s;
    if (s) dirty = true;
  }
  return dirty ? syn : null;
}

// Repairs `cw` in place. Returns the number of fixed bytes, or -1 when it cannot be repaired.
export function rsDecode(cw) {
  const n = cw.length;
  const syn = syndromes(cw);
  if (!syn) return 0;

  // Berlekamp-Massey: find the error locator polynomial.
  const lam = [1];
  let prev = [1];
  let L = 0;
  let m = 1;
  let b = 1;
  for (let k = 0; k < PARITY; k++) {
    let d = syn[k];
    for (let i = 1; i <= L; i++) d ^= mul(lam[i] ?? 0, syn[k - i]);
    if (d === 0) {
      m++;
      continue;
    }
    const old = lam.slice();
    const coef = div(d, b);
    while (lam.length < prev.length + m) lam.push(0);
    for (let i = 0; i < prev.length; i++) lam[i + m] ^= mul(coef, prev[i]);
    if (2 * L <= k) {
      L = k + 1 - L;
      prev = old;
      b = d;
      m = 1;
    } else {
      m++;
    }
  }
  if (L === 0 || L > PARITY / 2) return -1;

  // Chien search: the error at exponent e is a root of lam at alpha^-e.
  const roots = [];
  for (let e = 0; e < n; e++) {
    const inv = (255 - e) % 255;
    let v = 0;
    for (let i = 0; i < lam.length; i++)
      if (lam[i]) v ^= EXP[(LOG[lam[i]] + inv * i) % 255];
    if (!v) roots.push(e);
  }
  if (roots.length !== L) return -1;

  // Forney: error values from omega = syn * lam mod x^L.
  const omega = new Array(L).fill(0);
  for (let i = 0; i < L; i++)
    for (let j = 0; j <= i; j++) omega[i] ^= mul(lam[j] ?? 0, syn[i - j]);
  for (const e of roots) {
    const inv = (255 - e) % 255;
    let num = 0;
    for (let i = 0; i < L; i++)
      if (omega[i]) num ^= EXP[(LOG[omega[i]] + inv * i) % 255];
    let den = 0;
    for (let i = 1; i <= L; i += 2)
      if (lam[i]) den ^= EXP[(LOG[lam[i]] + inv * (i - 1)) % 255];
    if (!den) return -1;
    cw[n - 1 - e] ^= mul(EXP[e], div(num, den));
  }
  return syndromes(cw) ? -1 : L;
}

// ---------- grid layout ----------

const layouts = new Map();

function layout(G) {
  const cached = layouts.get(G);
  if (cached) return cached;
  const reserved = new Uint8Array(G * G);
  for (const [r0, c0] of [
    [0, 0],
    [0, G - ZONE],
    [G - ZONE, 0],
    [G - ZONE, G - ZONE],
  ])
    for (let r = 0; r < ZONE; r++)
      for (let c = 0; c < ZONE; c++) reserved[(r0 + r) * G + c0 + c] = 1;
  for (let k = 0; k < SYNC.length; k++) reserved[SYNC_COL + k] = 1;

  const cells = [];
  for (let i = 0; i < G * G; i++) if (!reserved[i]) cells.push(i);
  const T = Math.floor((cells.length * 3) / 8); // coded bytes that fit
  const blocks = Math.ceil(T / 255);
  const lens = Array.from(
    { length: blocks },
    (_, b) => Math.floor(T / blocks) + (b < T % blocks ? 1 : 0),
  );
  // Interleave: byte p of the stream is byte j of block b. A damaged patch of the
  // screen then spreads over many blocks instead of killing one.
  const order = new Uint32Array(T);
  let p = 0;
  for (let j = 0; j < lens[0]; j++)
    for (let b = 0; b < blocks; b++) if (j < lens[b]) order[p++] = b * 256 + j;

  const key = new Uint8Array(T);
  let x = 0x9e3779b9;
  for (let i = 0; i < T; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    key[i] = (x >>> 8) & 255;
  }
  const l = {
    cells: Int32Array.from(cells),
    T,
    lens,
    order,
    key,
    capacity: T - PARITY * blocks,
  };
  layouts.set(G, l);
  return l;
}

// Frame bytes that fit in one code of this grid size.
export const capacity = (G) => layout(G).capacity;

// ---------- encoder ----------

function paintFinder(colors, G, ox, oy) {
  for (let dy = 0; dy < FINDER; dy++)
    for (let dx = 0; dx < FINDER; dx++) {
      const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      colors[(oy + dy) * G + ox + dx] = ring === 2 ? 7 : 0;
    }
}

// Returns G*G color indexes (0-7). Color bits are R<<2 | G<<1 | B.
export function encodeCells(frame, G) {
  const l = layout(G);
  if (frame.length > l.capacity) throw new Error("Frame does not fit.");
  const padded = new Uint8Array(l.capacity);
  padded.set(frame);

  const words = [];
  let off = 0;
  for (const len of l.lens) {
    words.push(rsEncode(padded.subarray(off, off + len - PARITY)));
    off += len - PARITY;
  }
  const stream = new Uint8Array(l.T);
  for (let p = 0; p < l.T; p++) {
    const v = l.order[p];
    stream[p] = words[v >> 8][v & 255] ^ l.key[p];
  }

  const colors = new Uint8Array(G * G);
  for (const [r0, c0] of [
    [0, 0],
    [0, G - ZONE],
    [G - ZONE, 0],
    [G - ZONE, G - ZONE],
  ])
    for (let r = 0; r < ZONE; r++)
      for (let c = 0; c < ZONE; c++) colors[(r0 + r) * G + c0 + c] = 7;
  paintFinder(colors, G, 0, 0);
  paintFinder(colors, G, G - FINDER, 0);
  paintFinder(colors, G, 0, G - FINDER);
  paintFinder(colors, G, G - FINDER, G - FINDER);
  SYNC.forEach((c, k) => {
    colors[SYNC_COL + k] = c;
  });

  let acc = 0;
  let nbits = 0;
  let si = 0;
  for (const cell of l.cells) {
    while (nbits < 3) {
      acc = (acc << 8) | (si < l.T ? stream[si] : 0xa5);
      si++;
      nbits += 8;
    }
    colors[cell] = (acc >> (nbits - 3)) & 7;
    nbits -= 3;
    acc &= (1 << nbits) - 1;
  }
  return colors;
}

// Draws the colors with `px` pixels per cell. Returns RGBA pixels.
export function renderRGBA(colors, G, px) {
  const side = (G + 2 * QUIET) * px;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  const row = new Uint8ClampedArray(side * 4).fill(255);
  for (let r = 0; r < G; r++) {
    for (let c = 0; c < G; c++) {
      const v = colors[r * G + c];
      for (let k = 0; k < px; k++) {
        const o = ((c + QUIET) * px + k) * 4;
        row[o] = v & 4 ? 255 : 0;
        row[o + 1] = v & 2 ? 255 : 0;
        row[o + 2] = v & 1 ? 255 : 0;
      }
    }
    for (let k = 0; k < px; k++)
      data.set(row, ((r + QUIET) * px + k) * side * 4);
  }
  return { data, width: side, height: side };
}

// ---------- homography ----------

// Solves the projective map that sends src[i] to dst[i] for four point pairs.
export function solveHomography(src, dst) {
  const A = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i];
    const [x, y] = dst[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }
  for (let col = 0; col < 8; col++) {
    let best = col;
    for (let r = col + 1; r < 8; r++)
      if (Math.abs(A[r][col]) > Math.abs(A[best][col])) best = r;
    if (Math.abs(A[best][col]) < 1e-12) return null;
    [A[col], A[best]] = [A[best], A[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let c = col; c < 9; c++) A[r][c] -= f * A[col][c];
    }
  }
  return A.map((row, i) => row[8] / row[i]);
}

// ---------- sampling ----------

const SPREAD = 0.2; // sample offset in cells, for the 5-point average

function readCell(img, h, u, v, out) {
  let r = 0;
  let g = 0;
  let b = 0;
  const { data, width, height } = img;
  for (let k = 0; k < 5; k++) {
    const uu = u + (k === 1 ? SPREAD : k === 2 ? -SPREAD : 0);
    const vv = v + (k === 3 ? SPREAD : k === 4 ? -SPREAD : 0);
    const den = h[6] * uu + h[7] * vv + 1;
    let x = Math.floor((h[0] * uu + h[1] * vv + h[2]) / den);
    let y = Math.floor((h[3] * uu + h[4] * vv + h[5]) / den);
    x = x < 0 ? 0 : x >= width ? width - 1 : x;
    y = y < 0 ? 0 : y >= height ? height - 1 : y;
    const i = (y * width + x) * 4;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  out[0] = r / 5;
  out[1] = g / 5;
  out[2] = b / 5;
}

const BLACK_AT = [
  [0.5, 0.5],
  [6.5, 0.5],
  [0.5, 6.5],
  [6.5, 6.5],
  [0.5, 3.5],
  [3.5, 0.5],
  [6.5, 3.5],
  [3.5, 6.5],
];
const WHITE_AT = [
  [1.5, 1.5],
  [5.5, 1.5],
  [1.5, 5.5],
  [5.5, 5.5],
  [1.5, 3.5],
  [3.5, 1.5],
  [5.5, 3.5],
  [3.5, 5.5],
];

// Per corner and channel, the level halfway between black and white.
// Returns null when the finders do not show enough contrast.
function calibrate(img, h, G) {
  const thr = new Float64Array(12);
  const tmp = new Float64Array(3);
  const corners = [
    [0, 0],
    [G - FINDER, 0],
    [0, G - FINDER],
    [G - FINDER, G - FINDER],
  ];
  for (let k = 0; k < 4; k++) {
    const lo = [0, 0, 0];
    const hi = [0, 0, 0];
    const [ox, oy] = corners[k];
    for (const [du, dv] of BLACK_AT) {
      readCell(img, h, ox + du, oy + dv, tmp);
      for (let c = 0; c < 3; c++) lo[c] += tmp[c] / BLACK_AT.length;
    }
    for (const [du, dv] of WHITE_AT) {
      readCell(img, h, ox + du, oy + dv, tmp);
      for (let c = 0; c < 3; c++) hi[c] += tmp[c] / WHITE_AT.length;
    }
    for (let c = 0; c < 3; c++) {
      if (hi[c] - lo[c] < MIN_CONTRAST) return null;
      thr[k * 3 + c] = (hi[c] + lo[c]) / 2;
    }
  }
  return thr;
}

function classify(img, h, G, thr, u, v, tmp) {
  readCell(img, h, u, v, tmp);
  const wx = u / G;
  const wy = v / G;
  let color = 0;
  for (let c = 0; c < 3; c++) {
    const t =
      thr[c] * (1 - wx) * (1 - wy) +
      thr[3 + c] * wx * (1 - wy) +
      thr[6 + c] * (1 - wx) * wy +
      thr[9 + c] * wx * wy;
    color = (color << 1) | (tmp[c] > t ? 1 : 0);
  }
  return color;
}

function syncMatches(img, h, G, thr) {
  const tmp = new Float64Array(3);
  let ok = 0;
  for (let k = 0; k < SYNC.length; k++)
    if (classify(img, h, G, thr, SYNC_COL + k + 0.5, 0.5, tmp) === SYNC[k])
      ok++;
  return ok >= SYNC.length - 1;
}

// Reads every data cell and repairs the blocks. Returns { bytes, fixed } or null.
function readFrame(img, h, G, thr) {
  const l = layout(G);
  const tmp = new Float64Array(3);
  const stream = new Uint8Array(l.T);
  let acc = 0;
  let nbits = 0;
  let si = 0;
  for (const cell of l.cells) {
    const color = classify(
      img,
      h,
      G,
      thr,
      (cell % G) + 0.5,
      Math.floor(cell / G) + 0.5,
      tmp,
    );
    acc = (acc << 3) | color;
    nbits += 3;
    if (nbits >= 8) {
      if (si < l.T) stream[si++] = (acc >> (nbits - 8)) & 255;
      nbits -= 8;
      acc &= (1 << nbits) - 1;
    }
  }
  const words = l.lens.map((len) => new Uint8Array(len));
  for (let p = 0; p < l.T; p++) {
    const v = l.order[p];
    words[v >> 8][v & 255] = stream[p] ^ l.key[p];
  }
  const bytes = new Uint8Array(l.capacity);
  let off = 0;
  let fixed = 0;
  for (const w of words) {
    const n = rsDecode(w);
    if (n < 0) return null;
    fixed += n;
    bytes.set(w.subarray(0, w.length - PARITY), off);
    off += w.length - PARITY;
  }
  return { bytes, fixed };
}

// ---------- finder search ----------

function minChannelThreshold(img) {
  const { data, width, height } = img;
  const hist = new Uint32Array(256);
  for (let y = 0; y < height; y += 5)
    for (let x = 0; x < width; x += 5) {
      const i = (y * width + x) * 4;
      hist[Math.min(data[i], data[i + 1], data[i + 2])]++;
    }
  // Otsu: the level that best separates the dark and the white pixels.
  let total = 0;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    total += hist[i];
    sum += i * hist[i];
  }
  let wB = 0;
  let sB = 0;
  let best = 0;
  let level = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sB += t * hist[t];
    const mB = sB / wB;
    const mF = (sum - sB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      level = t;
    }
  }
  return level;
}

// Runs [black, white, black, white, black] in the ratio 1:1:3:1:1. Returns the module size or 0.
function finderModule(runs) {
  const total = runs[0] + runs[1] + runs[2] + runs[3] + runs[4];
  if (total < 7) return 0;
  const m = total / 7;
  const tol = m * 0.65;
  if (
    Math.abs(runs[0] - m) < tol &&
    Math.abs(runs[1] - m) < tol &&
    Math.abs(runs[2] - 3 * m) < 1.5 * m &&
    Math.abs(runs[3] - m) < tol &&
    Math.abs(runs[4] - m) < tol
  )
    return m;
  return 0;
}

const SCAN_STEP = 3; // rows between horizontal scans

function findFinders(img) {
  const { data, width: w, height: h } = img;
  const thr = minChannelThreshold(img);
  const white = (x, y) => {
    const i = (y * w + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    return Math.min(r, g, b) > thr;
  };
  const count = (x, y, dx, dy, wantWhite) => {
    let n = 0;
    while (
      x >= 0 &&
      y >= 0 &&
      x < w &&
      y < h &&
      white(x, y) === wantWhite &&
      n < 600
    ) {
      n++;
      x += dx;
      y += dy;
    }
    return n;
  };
  // Measures the five runs through (x, y) along (dx, dy); (x, y) must be black.
  const measure = (x, y, dx, dy) => {
    if (x < 0 || y < 0 || x >= w || y >= h || white(x, y)) return null;
    const cp = count(x, y, dx, dy, false);
    const cn = count(x, y, -dx, -dy, false);
    const px = x + dx * cp;
    const py = y + dy * cp;
    const nx = x - dx * cn;
    const ny = y - dy * cn;
    const wp = count(px, py, dx, dy, true);
    const wn = count(nx, ny, -dx, -dy, true);
    const bp = count(px + dx * wp, py + dy * wp, dx, dy, false);
    const bn = count(nx - dx * wn, ny - dy * wn, -dx, -dy, false);
    const m = finderModule([bn, wn, cp + cn - 1, wp, bp]);
    return m ? { m, shift: (cp - cn) / 2 } : null;
  };

  const found = [];
  const runs = [0, 0, 0, 0, 0];
  for (let y = 0; y < h; y += SCAN_STEP) {
    let color = white(0, y);
    let len = 1;
    let seen = 0;
    for (let x = 1; x <= w; x++) {
      const c = x < w ? white(x, y) : !color;
      if (c === color) {
        len++;
        continue;
      }
      runs[0] = runs[1];
      runs[1] = runs[2];
      runs[2] = runs[3];
      runs[3] = runs[4];
      runs[4] = len;
      seen++;
      if (!color && seen >= 5 && finderModule(runs)) {
        // Positions are pixel edges: pixel i covers [i, i + 1).
        const vx = Math.floor(x - runs[4] - runs[3] - runs[2] / 2);
        const v = measure(vx, y, 0, 1);
        if (v) {
          const cy = y + 0.5 + v.shift;
          const hz = measure(vx, Math.floor(cy), 1, 0);
          if (hz) {
            const cx = vx + 0.5 + hz.shift;
            const m = (v.m + hz.m) / 2;
            const same = found.find(
              (f) => Math.abs(f.x - cx) < 2 * m && Math.abs(f.y - cy) < 2 * m,
            );
            if (same) {
              same.x = (same.x * same.n + cx) / (same.n + 1);
              same.y = (same.y * same.n + cy) / (same.n + 1);
              same.m = (same.m * same.n + m) / (same.n + 1);
              same.n++;
            } else {
              found.push({ x: cx, y: cy, m, n: 1 });
            }
          }
        }
      }
      color = c;
      len = 1;
    }
  }
  return pickQuad(found.filter((f) => f.n >= 2));
}

// Picks four candidates that form a convex, roughly square quad. Returns the
// points in clockwise screen order plus the mean module size, or null.
function pickQuad(cands) {
  const top = cands.sort((a, b) => b.n - a.n).slice(0, 8);
  let best = null;
  for (let i = 0; i < top.length; i++)
    for (let j = i + 1; j < top.length; j++)
      for (let k = j + 1; k < top.length; k++)
        for (let l = k + 1; l < top.length; l++) {
          const four = [top[i], top[j], top[k], top[l]];
          const ms = four.map((f) => f.m);
          const m = ms.reduce((a, b) => a + b) / 4;
          if (Math.max(...ms) > 1.6 * Math.min(...ms)) continue;
          const cx = four.reduce((a, f) => a + f.x, 0) / 4;
          const cy = four.reduce((a, f) => a + f.y, 0) / 4;
          four.sort(
            (a, b) =>
              Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
          );
          const side = four.map((f, n) => {
            const g = four[(n + 1) % 4];
            return Math.hypot(g.x - f.x, g.y - f.y);
          });
          const shortest = Math.min(...side);
          if (shortest < 30 * m || shortest < 0.45 * Math.max(...side))
            continue;
          let convex = true;
          for (let n = 0; n < 4; n++) {
            const a = four[n];
            const b = four[(n + 1) % 4];
            const c = four[(n + 2) % 4];
            if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0)
              convex = false;
          }
          if (!convex) continue;
          const score =
            four.reduce((a, f) => a + f.n, 0) * (shortest / Math.max(...side));
          if (!best || score > best.score)
            best = { score, pts: four.map((f) => [f.x, f.y]), m, side };
        }
  return best;
}

// ---------- decoder ----------

function homographyFor(pts, G, rot) {
  const at = (k) => pts[(k + rot) % 4];
  const c = FINDER / 2;
  return solveHomography(
    [
      [c, c],
      [G - c, c],
      [G - c, G - c],
      [c, G - c],
    ],
    [at(0), at(1), at(2), at(3)],
  );
}

function attempt(img, h, G) {
  const thr = calibrate(img, h, G);
  return thr ? readFrame(img, h, G, thr) : null;
}

export class Decoder {
  constructor() {
    this.grid = null; // known grid size, or null to try them all
    this.track = null; // the last good mapping, tried first on the next image
  }

  setGrid(grid) {
    this.grid = grid;
    this.track = null;
  }

  // img: { data: RGBA bytes, width, height }. Returns { bytes, grid, fixed } or null.
  decode(img) {
    if (this.track) {
      const r = attempt(img, this.track.h, this.track.grid);
      if (r) return { ...r, grid: this.track.grid };
      this.track = null;
    }
    const quad = findFinders(img);
    if (!quad) return null;
    const mean = quad.side.reduce((a, b) => a + b) / 4;
    const guess = mean / quad.m + FINDER;
    const sizes = this.grid
      ? [this.grid]
      : [...GRIDS].sort((a, b) => Math.abs(a - guess) - Math.abs(b - guess));
    for (const G of sizes)
      for (let rot = 0; rot < 4; rot++) {
        const h = homographyFor(quad.pts, G, rot);
        if (!h) continue;
        const thr = calibrate(img, h, G);
        if (!thr || !syncMatches(img, h, G, thr)) continue;
        const r = readFrame(img, h, G, thr);
        if (r) {
          this.track = { h, grid: G };
          return { ...r, grid: G };
        }
      }
    return null;
  }
}
