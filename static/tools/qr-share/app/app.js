// UI glue for the QR file transfer tool. All data stays in page memory.
// The protocol, fountain code and QR decoder come from decimen-optical-transfer (AGPL-3.0),
// see vendor/README.md. The decoder runs in rx-worker.js, one WASM instance per worker.
// Text that comes from a code is written with textContent, never innerHTML.

import {
  findGaps,
  formatRanges,
  packFin,
  packMeta,
  parseFin,
  parseMeta,
  parseRanges,
  rangeFrames,
} from "./fin.js";
import {
  blockLength,
  classifyFrame,
  createFrameQr,
  cycleLength,
  DecodeWorkerPool,
  estimateTransferProgress,
  fitsInOneStream,
  fnv1a,
  frameVerdictMessage,
  gridDims,
  LTDecoder,
  LTEncoder,
  QUIET_ZONE_MODULES as MARGIN,
  minimumFrameBytes,
  packFile,
  packFrame,
  parseFrame,
  rasterizeQr,
  streamIdentity,
  unpackFile,
  verifyFile,
} from "./vendor/decimen-core.js";

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi, fallback) =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : fallback));

const fmtBytes = (n) =>
  n < 1000
    ? `${Math.round(n)} B`
    : n < 1e6
      ? `${(n / 1e3).toFixed(1)} KB`
      : `${(n / 1e6).toFixed(2)} MB`;
const fmtRate = (bytesPerSecond) => `${fmtBytes(bytesPerSecond)}/s`;

// Keeps the screen on, or the sender freezes on one frame and the receiver loses the camera.
async function keepAwake() {
  try {
    await navigator.wakeLock?.request("screen");
  } catch {
    // Not allowed here. The transfer still works if the screen stays on by itself.
  }
}

// ---------- tabs ----------

function showTab(name) {
  for (const t of ["send", "receive"]) {
    $(t).hidden = t !== name;
    $(`tab-${t}`).classList.toggle("active", t === name);
  }
}
$("tab-send").onclick = () => showTab("send");
$("tab-receive").onclick = () => showTab("receive");

// ---------- sender ----------

// A smaller frame is a smaller QR code, so every cell is larger on screen and easier for a
// phone camera to tell apart. The default keeps cells large and still fills a code well.
const FRAME_BYTES = [500, 1000, 1465, 1850, 2331, 2953];
const DEFAULT_FRAME_BYTES = 2331;
for (const n of FRAME_BYTES) {
  const option = new Option(`${n} B`, n);
  option.selected = n === DEFAULT_FRAME_BYTES;
  $("bytes").append(option);
}

const FPS = { min: 1, max: 60, fallback: 20 };
$("fps").min = FPS.min;
$("fps").max = FPS.max;
// The lower bound is enforced on change, so a number can still be typed digit by digit.
$("fps").addEventListener("input", () => {
  if (Number.parseInt($("fps").value, 10) > FPS.max) $("fps").value = FPS.max;
});
const fps = () =>
  clamp(parseInt($("fps").value, 10), FPS.min, FPS.max, FPS.fallback);

const FIN_HOLD_MS = 1000;
const LOOKAHEAD = 3; // codes made ahead per grid cell, so a flip never waits for the QR maths
const canvas = $("code");
const staging = document.createElement("canvas");

let packed = null; // { name, size, container, compression, transmittedSize }
let generation = 0; // a new start or reset retires the running loop
let paused = false;
let live = null; // the running stream: { stop, resize, flips }
let packing = 0;

function fail(message) {
  $("send-error").textContent = message;
}

function setIdle(idle) {
  $("start").disabled = !idle || !packed;
  $("pause").disabled = $("reset-send").disabled = idle;
  $("replay").disabled = $("replay-go").disabled = idle;
}

function stopRun() {
  generation++;
  live = null;
  preview = null;
  paused = false;
  $("pause").textContent = "Pause";
  $("send-rate").textContent = "";
  canvas.hidden = true;
  setIdle(true);
}

async function prepare() {
  const file = $("file").files[0];
  stopRun();
  packed = null;
  setIdle(true);
  fail("");
  $("send-status").textContent = "";
  if (!file) {
    $("send-info").textContent = "Choose a file.";
    return;
  }
  // The file input keeps focus after a pick and would take the Space key that starts the send.
  $("file").blur();
  const id = ++packing;
  $("send-info").textContent = "Compressing...";
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await packFile(file.name, file.type, bytes);
    if (id !== packing) return;
    packed = { name: file.name, size: file.size, ...result };
  } catch (e) {
    if (id === packing) {
      $("send-info").textContent = "";
      fail(e.message);
    }
    return;
  }
  updateInfo();
  setIdle(true);
  showPreview();
}

function updateInfo() {
  if (!packed) return;
  const frameBytes = Number($("bytes").value);
  const blockLen = blockLength(frameBytes);
  const sent =
    packed.compression === "gzip"
      ? `${fmtBytes(packed.size)}, ${fmtBytes(packed.transmittedSize)} after gzip`
      : fmtBytes(packed.size);
  $("send-info").textContent =
    `${packed.name}: ${sent}. Each frame carries ${blockLen} B of file data.`;
}

// Sizes the code canvas for a picture totalW x totalH pixels at one pixel per module. The
// raster stays at a whole number of pixels per module and CSS stretches the rest smoothly.
// A jagged module width is harder to read. Returns that whole number.
function fitCanvas(totalW, totalH) {
  const dpr = window.devicePixelRatio || 1;
  const full = document.fullscreenElement === canvas.parentElement;
  const budgetW = full
    ? window.innerWidth
    : Math.min(canvas.parentElement.clientWidth, 760);
  const budgetH = full ? window.innerHeight : window.innerHeight * 0.85;
  const scale = Math.max(
    1,
    Math.floor(Math.min((budgetW * dpr) / totalW, (budgetH * dpr) / totalH)),
  );
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const nativeW = (totalW * scale) / dpr;
  const nativeH = (totalH * scale) / dpr;
  const stretch = Math.max(1, Math.min(budgetW / nativeW, budgetH / nativeH));
  canvas.style.width = `${nativeW * stretch}px`;
  canvas.style.height = `${nativeH * stretch}px`;
  return scale;
}

// One META code, up as soon as a file is ready and until Start. It carries no data. It
// gives the person holding the receiver something to aim at, and shows what is coming.
let preview = null; // { resize } while the META code is on screen
function showPreview() {
  preview = null;
  if (!packed || live) return;
  const blockLen = blockLength(Number($("bytes").value));
  const k = Math.ceil(packed.container.length / blockLen);
  const qr = createFrameQr(
    packMeta({
      sessionId: 0,
      k,
      blockLen,
      size: packed.size,
      name: packed.name,
    }),
    "L",
  );
  const modules = qr.modules.size;
  const raster = rasterizeQr(modules, qr.modules.data, MARGIN);
  const image = new ImageData(
    new Uint8ClampedArray(raster.pixels.buffer),
    raster.size,
    raster.size,
  );
  const draw = () => {
    const scale = fitCanvas(raster.size, raster.size);
    staging.width = staging.height = raster.size;
    staging.getContext("2d").putImageData(image, 0, 0);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(staging, 0, 0, raster.size * scale, raster.size * scale);
  };
  canvas.hidden = false;
  draw();
  preview = { resize: draw };
  $("send-status").textContent =
    "This code names the file. Aim the receiver's camera at it, then press Space or Start transfer.";
}

function startStream() {
  preview = null;
  const gen = ++generation;
  const frameBytes = Number($("bytes").value);
  const codes = Number($("codes").value);
  const { cols, rows } = gridDims(codes);
  const container = packed.container;
  if (!fitsInOneStream(container.length, frameBytes)) {
    fail(
      `This file needs more than 65,535 blocks at ${frameBytes} B per frame. Pick at least ${minimumFrameBytes(container.length)} B per frame.`,
    );
    return false;
  }
  const blockLen = blockLength(frameBytes);
  const sessionId = (Math.floor(Math.random() * 0xffff) + 1) & 0xffff;
  const encoder = new LTEncoder(container, blockLen, sessionId);
  const header = {
    sessionId,
    seq: 0,
    k: encoder.k,
    blockLen,
    totalLen: container.length,
    payloadFnv: fnv1a(container),
    flags: 0,
  };
  let version; // the first code locks it. Every later code has the same size.
  let modules = 0;
  let scale = 1;
  let seq = 0;
  const cells = Array(codes).fill(null); // last image per grid cell, for repainting
  const queue = [];

  const cycle = cycleLength(encoder.k);
  const replay = []; // frame numbers the user asked to play again, played before anything else
  let finAt = -1; // the sequential position a FIN code was last made for
  let finNext = false; // a replay just ended, so show a FIN code to report what is left

  const toImage = (qr) => {
    modules = qr.modules.size;
    const raster = rasterizeQr(modules, qr.modules.data, MARGIN);
    return new ImageData(
      new Uint8ClampedArray(raster.pixels.buffer),
      raster.size,
      raster.size,
    );
  };

  // A FIN code goes up after every sweep of the file and after every replay. It is a QR
  // code of the same size as the others, so the grid does not change shape.
  const makeFin = () => ({
    n: -1,
    fin: true,
    img: toImage(
      createFrameQr(
        packFin({
          sessionId,
          k: encoder.k,
          sweeps: Math.floor(seq / cycle) + 1,
        }),
        "L",
        version,
      ),
    ),
  });

  const makeCell = () => {
    let n;
    let replayed = false;
    if (replay.length) {
      n = replay.shift();
      replayed = true;
      finNext = replay.length === 0;
    } else if (finNext) {
      finNext = false;
      return makeFin();
    } else if (seq % cycle === encoder.k && finAt !== seq) {
      finAt = seq;
      return makeFin();
    } else {
      n = seq++;
    }
    const bytes = packFrame({ ...header, seq: n }, encoder.encode(n));
    const qr = createFrameQr(bytes, "L", version);
    version ??= qr.version;
    return { n, replayed, img: toImage(qr) };
  };

  const playAgain = (frames) => {
    // Frames made ahead of the screen go back to the counter, then the replay goes first.
    seq -= queue.filter((q) => !q.replayed && !q.fin).length;
    if (queue.some((q) => q.fin)) finAt = -1;
    queue.length = 0;
    replay.length = 0;
    replay.push(...frames);
    finNext = false;
    pump(LOOKAHEAD * codes);
  };

  // Fits the code to the space it has. The raster stays at a whole number of pixels per
  // module and CSS stretches the rest smoothly. A jagged module width is harder to read.
  const sizeCanvas = () => {
    const cell = modules + 2 * MARGIN;
    const totalW = cell * cols;
    const totalH = cell * rows;
    scale = fitCanvas(totalW, totalH);
    staging.width = totalW;
    staging.height = totalH;
    const sctx = staging.getContext("2d");
    cells.forEach((img, i) => {
      if (img)
        sctx.putImageData(img, (i % cols) * cell, Math.floor(i / cols) * cell);
    });
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(staging, 0, 0, canvas.width, canvas.height);
  };

  const pump = (max) => {
    for (let n = 0; n < max && queue.length < LOOKAHEAD * codes; n++)
      queue.push(makeCell());
  };
  try {
    pump(LOOKAHEAD * codes);
  } catch (e) {
    fail(e.message);
    return false;
  }
  canvas.hidden = false;
  sizeCanvas();
  const flips = [];
  let cursor = 0;
  let lastSeq = -1; // the frame that went on screen last

  const paint = (index, item) => {
    const cell = modules + 2 * MARGIN;
    const cx = (index % cols) * cell;
    const cy = Math.floor(index / cols) * cell;
    cells[index] = item.img;
    if (!item.fin) lastSeq = item.n;
    staging.getContext("2d").putImageData(item.img, cx, cy);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      staging,
      cx,
      cy,
      cell,
      cell,
      cx * scale,
      cy * scale,
      cell * scale,
      cell * scale,
    );
  };

  // Puts one whole screen of frames up at once, starting at frame `start`.
  const show = (start) => {
    seq = Math.max(0, start);
    queue.length = 0;
    replay.length = 0;
    finNext = false;
    for (let i = 0; i < codes; i++) {
      const item = makeCell();
      if (item.fin) {
        paintAll(item);
        break;
      }
      paint(i, item);
    }
    cursor = 0;
    pump(LOOKAHEAD * codes);
  };
  // The FIN code fills every cell, so a camera that sees any one of them can read it.
  const paintAll = (item) => {
    for (let i = 0; i < codes; i++) paint(i, item);
  };
  // Steps by one screen. A frame is one code, so a grid steps by as many frames as it shows.
  const step = (direction) =>
    show(direction > 0 ? lastSeq + 1 : lastSeq - 2 * codes + 1);

  live = {
    resize: sizeCanvas,
    step,
    flips,
    codes,
    blockLen,
    k: encoder.k,
    position: () => lastSeq,
    replayLeft: () => replay.length,
    playAgain,
  };

  // Each cell flips at its own phase of the frame interval. A camera exposure that spans a
  // flip then catches at most one code half changed, not all of them at once.
  let nextAt = performance.now();
  const tick = (now) => {
    if (gen !== generation) return;
    requestAnimationFrame(tick);
    if (paused) {
      nextAt = now;
      return;
    }
    const interval = 1000 / fps();
    const sub = interval / codes;
    if (now < nextAt) return;
    if (now - nextAt > interval) nextAt = now; // after a stall, do not burst out old frames
    while (now >= nextAt) {
      const item = queue.shift();
      pump(1);
      if (!item) {
        nextAt = now + sub;
        break;
      }
      if (item.fin) {
        // Hold it long enough for the camera to catch it, then go on.
        paintAll(item);
        cursor = 0;
        nextAt = now + Math.max(FIN_HOLD_MS, 2 * interval);
        break;
      }
      paint(cursor, item);
      flips.push(now);
      cursor = (cursor + 1) % codes;
      nextAt += sub;
    }
  };
  requestAnimationFrame(tick);
  $("send-info").textContent =
    `${packed.name}: QR version ${version}, ${modules} modules wide, ${codes} on screen, ${encoder.k} blocks.`;
  return true;
}

// The line shown over the code in full screen, and in the status line otherwise.
function sendState() {
  const word = paused ? "Paused" : "Sending";
  return `${word} at ${fps()} fps, frame ${live.position()} (${live.k} blocks per sweep).`;
}

let osdTimer = 0;
// In full screen the page controls are out of reach, so the keys report back on the code.
function showOsd() {
  $("osd").textContent = sendState();
  $("osd").classList.add("on");
  clearTimeout(osdTimer);
  if (!paused)
    osdTimer = setTimeout(() => $("osd").classList.remove("on"), 2000);
}

setInterval(() => {
  if (!live) return;
  const left = live.replayLeft();
  $("send-status").textContent =
    `${sendState()}${left ? ` Replaying, ${left} frames to go.` : ""} The stream repeats until you press Reset.`;
  if (paused) return;
  const now = performance.now();
  while (live.flips.length && now - live.flips[0] > 1000) live.flips.shift();
  const perSecond = live.flips.length;
  $("send-rate").textContent =
    `Transfer rate: ${fmtRate(perSecond * live.blockLen)} (${perSecond} frames/s)`;
}, 500);

window.addEventListener("resize", () => (live ?? preview)?.resize());
document.addEventListener("fullscreenchange", () =>
  (live ?? preview)?.resize(),
);
canvas.onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else canvas.parentElement.requestFullscreen?.();
};

$("file").onchange = prepare;
$("bytes").onchange = $("codes").onchange = () => {
  if (live) stopRun();
  $("send-status").textContent = "";
  updateInfo();
  showPreview();
};
$("fps").onchange = () => {
  $("fps").value = fps();
};

$("start").onclick = () => {
  fail("");
  paused = false;
  if (!startStream()) {
    showPreview();
    return;
  }
  keepAwake();
  $("send-rate").textContent = "Transfer rate: measuring...";
  $("send-status").textContent =
    "Sending. The stream repeats until you press Reset, so keep it up until the receiver says Done.";
  setIdle(false);
};

function setPaused(value) {
  paused = value;
  $("pause").textContent = paused ? "Resume" : "Pause";
  if (paused) $("send-rate").textContent = "Transfer rate: paused";
}
$("pause").onclick = () => setPaused(!paused);

// Keys work in full screen too, where the buttons cannot be reached. Space pauses and
// resumes. Left and Right step one frame while paused. Up and Down change the speed.
const FPS_STEP = 5;
document.addEventListener("keydown", (e) => {
  if (!live || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.("input, select, textarea, button")) return;
  switch (e.key) {
    case " ":
      setPaused(!paused);
      break;
    case "ArrowLeft":
    case "ArrowRight":
      if (!paused) return;
      live.step(e.key === "ArrowRight" ? 1 : -1);
      break;
    case "ArrowUp":
    case "ArrowDown":
      $("fps").value = clamp(
        fps() + (e.key === "ArrowUp" ? FPS_STEP : -FPS_STEP),
        FPS.min,
        FPS.max,
        FPS.fallback,
      );
      break;
    default:
      return;
  }
  e.preventDefault();
  showOsd();
});

// A tapped button must not stay highlighted, and it must not keep the Space key.
document.addEventListener("click", (e) => e.target.closest?.("button")?.blur());

// While the META code is on screen, Space starts the transfer, as the Start button does.
document.addEventListener("keydown", (e) => {
  if (live || !preview || $("send").hidden || e.key !== " ") return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.("input, select, textarea, button")) return;
  e.preventDefault();
  $("start").click();
});

// Only digits and "/" can be typed, so a stray letter never reaches the parser.
$("replay").addEventListener("input", () => {
  $("replay").value = $("replay").value.replace(/[^\d/]/g, "");
});
function replayNow() {
  fail("");
  if (!live) return;
  const parsed = parseRanges($("replay").value, live.k);
  if (parsed.error) {
    fail(parsed.error);
    return;
  }
  const frames = rangeFrames(parsed.ranges);
  live.playAgain(frames);
  $("replay").value = "";
  $("send-status").textContent = `Replaying ${frames.length} frames.`;
}
$("replay-go").onclick = replayNow;
$("replay").addEventListener("keydown", (e) => {
  if (e.key === "Enter") replayNow();
});

$("reset-send").onclick = () => {
  stopRun();
  updateInfo();
  showPreview();
  $("send-status").textContent = "Stopped. Press Start transfer to send again.";
};

// ---------- receiver ----------
//
// The scene is mostly still, so once a code is found the next frames are cut down to a
// padded box around it. Small pictures decode faster, and the decoder can skip its search
// and read the code straight from its last four corners. A full-frame scan still runs now
// and then to find new codes. The camera is never slowed down: a frame that finds every
// worker busy is dropped and counted, never queued. The fountain code does not need it.

const GAP_LIST = 6; // runs listed after a FIN code
const REGION_TTL_MS = 1500;
const FULL_SCAN_MS = 1500;
const FULL_SCAN_DEGRADED_MS = 250;
const ACQUISITION_SCAN_MS = 100;
const EXPECTED_DECAY_MS = 10_000;
const REGION_PAD = 0.35;
const MAX_REGIONS = 9;
const WORKERS = Math.max(
  2,
  Math.min(4, (navigator.hardwareConcurrency || 4) - 1),
);

const video = $("video");
const grab = document.createElement("canvas");
let stream = null;
let captureGen = 0;
let done = false;
let decoder = null;
let streamKey = "";
let startedAt = 0;
let result = null; // { file, seconds }
let regions = [];
let lastFullScan = 0;
let cropRotate = 0;
let expected = 0;
let expectedAt = 0;
let frameId = 0;
let verdict = "";
let finSeen = false; // a FIN code of this stream was read, so the missing runs are shown
let incoming = null; // the META code read before any data: { k, blockLen, size, name }
const stats = { captured: 0, decoded: 0, dropped: 0, tracked: 0, attempts: 0 };
let shown = { ...stats };
let rateWindow = []; // [time, payload bytes] for every useful frame

const pool = new DecodeWorkerPool(
  () => new Worker(new URL("./rx-worker.js", import.meta.url)),
  (bytes, box, info) => onDecoded(bytes, box, info),
  (box) => noteRegion(box, performance.now(), false),
  () => stats.attempts++,
);

function noteRegion(box, now, decodedHere = true, info) {
  for (const r of regions) {
    const dx = Math.abs(box.x + box.w / 2 - (r.x + r.w / 2));
    const dy = Math.abs(box.y + box.h / 2 - (r.y + r.h / 2));
    if (dx < Math.max(box.w, r.w) / 2 && dy < Math.max(box.h, r.h) / 2) {
      if (!decodedHere) {
        r.seen = now; // A failed detection can keep a box alive but never move it.
        return;
      }
      r.drift = 0.5 * (r.drift ?? 0) + 0.5 * Math.hypot(dx, dy);
      Object.assign(r, box, { seen: now, decoded: true });
      if (info?.quad) r.quad = info.quad;
      if (info?.modules) r.dim = info.modules;
      return;
    }
  }
  if (!decodedHere) {
    // Grid codes share one size, so a sighting far off a proven code's size is noise.
    const reference = regions.find((r) => r.decoded);
    if (!reference) return;
    const ratio = Math.max(box.w, box.h) / Math.max(reference.w, reference.h);
    if (ratio < 0.5 || ratio > 2) return;
  }
  regions.push({
    ...box,
    seen: now,
    decoded: decodedHere,
    quad: info?.quad,
    dim: info?.modules,
  });
  if (regions.length > MAX_REGIONS) {
    regions.sort(
      (a, b) => Number(b.decoded) - Number(a.decoded) || b.seen - a.seen,
    );
    regions.length = MAX_REGIONS;
  }
}

function captureFrame() {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const now = performance.now();
  stats.captured++;
  if (pool.busyCount === pool.size) {
    stats.dropped++;
    return;
  }
  regions = regions.filter((r) => now - r.seen <= REGION_TTL_MS);
  const proven = regions.filter((r) => r.decoded).length;
  if (proven >= expected || now - expectedAt > EXPECTED_DECAY_MS) {
    expected = proven;
    expectedAt = now;
  }
  // Fewer codes than the stream has shown means one is missing. Crops cannot find it,
  // so look at the whole frame more often until it is back.
  const interval =
    proven === 0
      ? ACQUISITION_SCAN_MS
      : proven < expected
        ? FULL_SCAN_DEGRADED_MS
        : FULL_SCAN_MS;
  if (grab.width !== vw || grab.height !== vh) {
    grab.width = vw;
    grab.height = vh;
  }
  const ctx = grab.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0);
  if (now - lastFullScan > interval) {
    lastFullScan = now;
    const img = ctx.getImageData(0, 0, vw, vh);
    pool.submit(
      {
        id: frameId++,
        buf: img.data.buffer,
        w: vw,
        h: vh,
        ox: 0,
        oy: 0,
        full: true,
      },
      [img.data.buffer],
    );
    return;
  }
  for (let i = 0; i < regions.length; i++) {
    const r = regions[(i + cropRotate) % regions.length];
    // The box leads a moving code by twice the drift seen between its last decodes.
    const size = Math.max(r.w, r.h);
    const pad = Math.round(
      size * REGION_PAD + Math.min(size, 2 * (r.drift ?? 0)),
    );
    const x = Math.max(0, Math.floor(r.x - pad));
    const y = Math.max(0, Math.floor(r.y - pad));
    const w = Math.min(vw - x, Math.ceil(r.w + 2 * pad));
    const h = Math.min(vh - y, Math.ceil(r.h + 2 * pad));
    if (w < 32 || h < 32) continue;
    const img = ctx.getImageData(x, y, w, h);
    const taken = pool.submit(
      {
        id: frameId++,
        buf: img.data.buffer,
        w,
        h,
        ox: x,
        oy: y,
        full: false,
        quad: r.quad,
        dim: r.dim,
      },
      [img.data.buffer],
    );
    if (!taken) break;
  }
  cropRotate++;
}

function schedule(gen) {
  if (done || gen !== captureGen) return;
  const next = () => {
    if (done || gen !== captureGen) return;
    captureFrame();
    schedule(gen);
  };
  if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(next);
  else requestAnimationFrame(next);
}

function onDecoded(bytes, box, info) {
  if (done) return;
  stats.decoded++;
  if (info?.tracked) stats.tracked++;
  if (box) noteRegion(box, performance.now(), true, info);
  const meta = parseMeta(bytes);
  if (meta) {
    // The sender is showing what it will send. This only helps with aiming.
    if (!decoder) {
      incoming = meta;
      requestRender();
    }
    return;
  }
  const fin = parseFin(bytes);
  if (fin) {
    // The sender finished a sweep. Only the stream being received counts.
    if (decoder && fin.sessionId === decoder.sessionId && fin.k === decoder.k) {
      finSeen = true;
      requestRender();
    }
    return;
  }
  const parsed = parseFrame(bytes);
  if (!parsed) {
    // Some other QR code, or a frame from a different version of the sender.
    const message = frameVerdictMessage(classifyFrame(bytes));
    if (message && message !== verdict) {
      verdict = message;
      $("rx-error").textContent = message;
    }
    return;
  }
  if (verdict) {
    verdict = "";
    $("rx-error").textContent = "";
  }
  const { header, block } = parsed;
  const key = streamIdentity(header);
  if (!decoder || key !== streamKey) {
    decoder = new LTDecoder(
      header.k,
      header.blockLen,
      header.sessionId,
      header.totalLen,
    );
    streamKey = key;
    incoming = null;
    finSeen = false;
    startedAt = performance.now();
    rateWindow = [];
  }
  const before = decoder.framesNew - decoder.framesRedundant;
  decoder.addFrame(header.seq, block);
  if (decoder.framesNew - decoder.framesRedundant > before)
    rateWindow.push([performance.now(), header.blockLen]);
  if (decoder.isComplete) finish(header);
  else requestRender();
}

async function finish(header) {
  const generationNow = captureGen;
  done = true;
  captureGen++;
  const seconds = (performance.now() - startedAt) / 1000;
  try {
    const container = decoder.assemble();
    if (fnv1a(container) !== header.payloadFnv)
      throw new Error(
        "The received data failed its checksum. Press Reset and try again.",
      );
    const file = await unpackFile(container);
    if (!(await verifyFile(file)))
      throw new Error(
        "The file failed its SHA-256 check. Press Reset and try again.",
      );
    if (generationNow !== captureGen - 1) return; // reset while checking
    result = { file, seconds };
    stopCamera();
  } catch (e) {
    $("rx-error").textContent = e.message;
    done = false;
    decoder = null;
    captureGen++;
    schedule(captureGen);
  }
  render();
}

function stopCamera() {
  for (const t of stream?.getTracks() ?? []) t.stop();
  stream = null;
  video.srcObject = null;
  pool.resize(0);
  regions = [];
  setupZoom();
}

// ---------- zoom ----------
//
// Zoom is the camera's own, as in a camera app: the sensor reads a smaller part of the
// scene, so a distant code gets more pixels. A zoomed-in picture of the same size would
// not help the decoder, so where the browser offers no zoom the control stays hidden.
// Pinching the picture zooms too. The level survives a camera restart.

let zoomLevel = 1;
let zoomRange = null; // { min, max, step } when the camera can zoom
let zoomWant = null;
let zoomBusy = false;
// Some browsers fire only "change" for a range input, so listen to both.
$("zoom").addEventListener("change", () => setZoom(Number($("zoom").value)));

function setupZoom() {
  const track = stream?.getVideoTracks()[0];
  const caps = track?.getCapabilities?.().zoom;
  zoomRange = caps && caps.max > caps.min ? caps : null;
  $("zoom-row").hidden = !zoomRange;
  $("zoom-note").hidden = !(track && !zoomRange);
  $("video").parentElement.classList.toggle("zoomable", !!zoomRange);
  if (!zoomRange) return;
  const slider = $("zoom");
  slider.min = zoomRange.min;
  slider.max = zoomRange.max;
  slider.step = zoomRange.step || 0.1;
  setZoom(zoomLevel);
}

async function setZoom(level) {
  if (!zoomRange) return;
  zoomLevel = clamp(level, zoomRange.min, zoomRange.max, zoomRange.min);
  $("zoom").value = zoomLevel;
  $("zoom-value").textContent = `${zoomLevel.toFixed(1)}x`;
  zoomWant = zoomLevel;
  if (zoomBusy) return; // the running call picks up the newest level when it finishes
  zoomBusy = true;
  try {
    while (zoomWant !== null && stream) {
      const want = zoomWant;
      zoomWant = null;
      await stream
        .getVideoTracks()[0]
        .applyConstraints({ advanced: [{ zoom: want }] })
        // Some browsers accept zoom only as a plain constraint.
        .catch(() =>
          stream?.getVideoTracks()[0]?.applyConstraints({ zoom: want }),
        );
      // Boxes found at the old zoom no longer point at the codes.
      regions = [];
    }
  } catch (e) {
    $("rx-error").textContent = `Zoom failed: ${e.name}`;
  } finally {
    zoomBusy = false;
    zoomWant = null;
  }
}

$("zoom").addEventListener("input", () => setZoom(Number($("zoom").value)));

{
  const picture = $("video").parentElement;
  const fingers = new Map();
  let pinch = null; // { distance, level } when two fingers are down
  const spread = () => {
    const [a, b] = [...fingers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  };
  picture.addEventListener("pointerdown", (e) => {
    if (!zoomRange) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    picture.setPointerCapture?.(e.pointerId);
    if (fingers.size === 2) pinch = { distance: spread(), level: zoomLevel };
  });
  picture.addEventListener("pointermove", (e) => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && fingers.size === 2)
      setZoom((pinch.level * spread()) / pinch.distance);
  });
  const lift = (e) => {
    fingers.delete(e.pointerId);
    if (fingers.size < 2) pinch = null;
  };
  picture.addEventListener("pointerup", lift);
  picture.addEventListener("pointercancel", lift);
}

// Frame rate is demanded exactly first, because some phones answer a polite request for
// 60 fps with 30. The retry takes whatever the camera can give.
async function acquireCamera() {
  const base = {
    facingMode: "environment",
    // Desktop Chrome lets a page move a webcam's zoom only if it asked for it up front.
    zoom: true,
    width: { ideal: 1280 },
    height: { ideal: 960 },
  };
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { ...base, frameRate: { exact: 60 } },
    });
  } catch (e) {
    if (e.name === "NotAllowedError" || e.name === "SecurityError") throw e;
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { ...base, frameRate: { ideal: 60 } },
    });
  }
}

function cameraError(e) {
  switch (e.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera permission is denied. Allow the camera for this site in the browser or system settings, then press Start camera again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device.";
    case "NotReadableError":
      return "The camera is in use by another app. Close that app and try again.";
    default:
      return `Camera error: ${e.name}: ${e.message}`;
  }
}

$("cam").onclick = async () => {
  $("rx-error").textContent = "";
  if (stream) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    $("rx-error").textContent =
      `The browser blocks the camera on this address (${location.origin}). Open the page over https:// or on localhost. A LAN address such as http://192.168.x.x and file:// do not work.`;
    return;
  }
  try {
    stream = await acquireCamera();
    video.srcObject = stream;
    await video.play();
  } catch (e) {
    stopCamera();
    $("rx-error").textContent = cameraError(e);
    return;
  }
  done = false;
  pool.resize(WORKERS);
  setupZoom();
  keepAwake();
  captureGen++;
  schedule(captureGen);
  render();
};

$("reset").onclick = () => {
  captureGen++;
  decoder = null;
  streamKey = "";
  result = null;
  regions = [];
  rateWindow = [];
  verdict = "";
  finSeen = false;
  incoming = null;
  startedAt = 0;
  $("rx-rate").textContent = "";
  $("rx-error").textContent = "";
  if (stream) {
    done = false;
    schedule(captureGen);
  }
  render();
};

$("download").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([result.file.bytes], {
      type: result.file.type || "application/octet-stream",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = result.file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

setInterval(() => {
  const now = performance.now();
  rateWindow = rateWindow.filter(([t]) => now - t <= 1000);
  if (stream && decoder && !result) {
    const span = Math.min(1000, now - startedAt) / 1000;
    const bytes = rateWindow.reduce((sum, [, n]) => sum + n, 0);
    $("rx-rate").textContent =
      span > 0.2 ? `Transfer rate: ${fmtRate(bytes / span)}` : "";
  }
  if (!stream) return;
  const s = { ...stats };
  const d = (k) => s[k] - shown[k];
  const tried = d("attempts");
  $("rx-stats").textContent =
    `Camera ${d("captured")} frames/s, decoded ${d("decoded")}/s, dropped while busy ${d("dropped")}/s, codes tracked ${regions.filter((r) => r.decoded).length}` +
    (tried ? `, fast path ${Math.round((100 * d("tracked")) / tried)}%` : "");
  shown = s;
  if (decoder && !result) render();
}, 1000);

let renderTimer = 0;
// Redraw at most ten times a second, whatever the frame rate is.
function requestRender() {
  if (renderTimer) return;
  renderTimer = setTimeout(() => {
    renderTimer = 0;
    render();
  }, 100);
}

function render() {
  let status = "Camera is off.";
  if (result) status = "Done. The file is rebuilt and its SHA-256 matches.";
  else if (decoder) status = "Receiving...";
  else if (incoming)
    status =
      "Found the sender. Keep it in view and press Start transfer on it.";
  else if (stream) status = "Point the camera at the code on the sender.";
  $("rx-status").textContent = status;

  if (result) {
    const { file, seconds } = result;
    $("rx-rate").textContent =
      `Average rate: ${fmtRate(file.bytes.length / Math.max(seconds, 0.001))} (${fmtBytes(file.bytes.length)} in ${seconds.toFixed(1)} s)`;
    $("rx-info").textContent =
      `File: ${file.name}\nSize: ${file.bytes.length} B`;
  } else if (decoder) {
    const useful = decoder.framesNew - decoder.framesRedundant;
    const estimate = estimateTransferProgress(
      decoder.k,
      useful,
      (performance.now() - startedAt) / 1000,
      decoder.solvedCount,
    );
    $("rx-info").textContent =
      `Progress: ${Math.floor(estimate.fraction * 100)}%\nBlocks solved: ${decoder.solvedCount} of ${decoder.k}\nFrames used: ${useful}`;
  } else if (incoming) {
    $("rx-info").textContent =
      `File: ${incoming.name}\nSize: ${fmtBytes(incoming.size)}`;
  } else {
    $("rx-info").textContent = "";
  }
  // After a FIN code, list the runs of blocks still missing, longest first. Typing them
  // into the sender plays exactly those frames again.
  const gaps = finSeen && decoder && !result ? findGaps(decoder.solved) : [];
  if (gaps.length) {
    const lacking = gaps.reduce((sum, g) => sum + g.count, 0);
    $("rx-gaps").textContent =
      `Missing ${lacking} blocks in ${gaps.length} runs. To play the longest again, type this into the sender: ${formatRanges(gaps, GAP_LIST)}`;
  } else {
    $("rx-gaps").textContent = "";
  }
  // Once a sender is found, the receiver becomes a popper that fills the screen, so the
  // picture, the progress and the buttons are all in view without scrolling. Reset closes it.
  $("receive").classList.toggle("popper", !!(incoming || decoder || result));
  $("download").hidden = !result;
  if (result) $("download").textContent = `Download ${result.file.name}`;
}
