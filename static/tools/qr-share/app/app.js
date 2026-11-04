// UI glue for the QR file transfer tool. All data stays in page memory.
// The protocol, fountain code and QR decoder come from decimen-optical-transfer (AGPL-3.0),
// see vendor/README.md. The decoder runs in rx-worker.js, one WASM instance per worker.
// Text that comes from a code is written with textContent, never innerHTML.

import {
  LTDecoder,
  LTEncoder,
  DecodeWorkerPool,
  QUIET_ZONE_MODULES as MARGIN,
  blockLength,
  classifyFrame,
  createFrameQr,
  cycleLength,
  estimateTransferProgress,
  fitsInOneStream,
  fnv1a,
  frameVerdictMessage,
  gridDims,
  minimumFrameBytes,
  packFile,
  packFrame,
  parseFrame,
  rasterizeQr,
  streamIdentity,
  unpackFile,
  verifyFile,
} from "./vendor/decimen-core.js";
import {
  findGaps,
  formatRanges,
  ACK_MAX_RUNS,
  packAck,
  packFin,
  parseAck,
  parseFin,
  parseRanges,
  rangeFrames,
} from "./fin.js";

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
const DEFAULT_FRAME_BYTES = 1465;
for (const n of FRAME_BYTES) {
  const option = new Option(`${n} B`, n);
  option.selected = n === DEFAULT_FRAME_BYTES;
  $("bytes").append(option);
}

const FPS = { min: 1, max: 60, fallback: 30 };
$("fps").min = FPS.min;
$("fps").max = FPS.max;
$("fps-range").textContent = `${FPS.min} to ${FPS.max}`;
// The lower bound is enforced on change, so a number can still be typed digit by digit.
$("fps").addEventListener("input", () => {
  if (Number.parseInt($("fps").value, 10) > FPS.max) $("fps").value = FPS.max;
});
const fps = () =>
  clamp(parseInt($("fps").value, 10), FPS.min, FPS.max, FPS.fallback);

const FIN_HOLD_MS = 1000;
const REPLAY_RETRY_MS = 3000; // a replayed block still missing after this is asked for again
const PEER_STALE_MS = 4000; // no ACK for this long and the link counts as lost
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

// The last ACK code the sender's camera read from the receiver's screen.
let peer = null; // { seq, solved, k, missing, at }
const linkAlive = () => !!peer && performance.now() - peer.at < PEER_STALE_MS;

function stopRun() {
  generation++;
  live = null;
  peer = null;
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

function startStream() {
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
    // With a live ACK link nobody needs a FIN code, and the stream never stops for one.
    const linked = linkAlive();
    if (replay.length) {
      n = replay.shift();
      replayed = true;
      replayedAt.set(n, performance.now());
      finNext = replay.length === 0 && !linked;
    } else if (finNext && !linked) {
      finNext = false;
      return makeFin();
    } else if (seq % cycle === encoder.k && finAt !== seq && !linked) {
      finAt = seq;
      return makeFin();
    } else {
      finNext = false;
      n = seq++;
    }
    const bytes = packFrame({ ...header, seq: n }, encoder.encode(n));
    const qr = createFrameQr(bytes, "L", version);
    version ??= qr.version;
    return { n, replayed, img: toImage(qr) };
  };

  const playAgain = (frames) => {
    // Frames made ahead of the screen go back to the counter. Replays that were already
    // made ahead are kept, in front of the new ones, so no request is lost.
    const ahead = queue.filter((q) => q.replayed).map((q) => q.n);
    seq -= queue.filter((q) => !q.replayed && !q.fin).length;
    if (queue.some((q) => q.fin)) finAt = -1;
    queue.length = 0;
    const merged = [...new Set([...ahead, ...replay, ...frames])];
    replay.length = 0;
    replay.push(...merged);
    finNext = false;
    pump(LOOKAHEAD * codes);
  };

  // The receiver's ACK code asks for blocks while the stream keeps running. A block that
  // is already queued, or was replayed a moment ago and may still be on its way, is left
  // alone. One that is still missing after that window is asked for again.
  const replayedAt = new Map();
  const onAck = (ack) => {
    const now = performance.now();
    const pending = new Set(replay);
    for (const q of queue) if (q.replayed) pending.add(q.n);
    const wanted = rangeFrames(ack.runs).filter(
      (n) =>
        n < encoder.k &&
        !pending.has(n) &&
        now - (replayedAt.get(n) ?? Number.NEGATIVE_INFINITY) > REPLAY_RETRY_MS,
    );
    if (wanted.length) playAgain(wanted);
    return wanted.length;
  };

  // Fits the code to the space it has. The raster stays at a whole number of pixels per
  // module and CSS stretches the rest smoothly. A jagged module width is harder to read.
  const sizeCanvas = () => {
    const dpr = window.devicePixelRatio || 1;
    const cell = modules + 2 * MARGIN;
    const totalW = cell * cols;
    const totalH = cell * rows;
    const full = document.fullscreenElement === canvas.parentElement;
    const budgetW = full
      ? window.innerWidth
      : Math.min(canvas.parentElement.clientWidth, 760);
    const budgetH = full ? window.innerHeight : window.innerHeight * 0.85;
    scale = Math.max(
      1,
      Math.floor(Math.min((budgetW * dpr) / totalW, (budgetH * dpr) / totalH)),
    );
    staging.width = totalW;
    staging.height = totalH;
    canvas.width = totalW * scale;
    canvas.height = totalH * scale;
    const nativeW = (totalW * scale) / dpr;
    const nativeH = (totalH * scale) / dpr;
    const stretch = Math.max(1, Math.min(budgetW / nativeW, budgetH / nativeH));
    canvas.style.width = `${nativeW * stretch}px`;
    canvas.style.height = `${nativeH * stretch}px`;
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
    onAck,
    sessionId,
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
  return `${word} at ${fps()} fps, frame ${live.position()} (${live.k} blocks per sweep).${peerState()}`;
}

function peerState() {
  if (!txStream) return "";
  if (!linkAlive()) return " No status from the receiver yet.";
  return ` Receiver has ${peer.solved} of ${peer.k} blocks, ${peer.missing} known missing.`;
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

window.addEventListener("resize", () => live?.resize());
document.addEventListener("fullscreenchange", () => live?.resize());
canvas.onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else canvas.parentElement.requestFullscreen?.();
};

$("file").onchange = prepare;
$("bytes").onchange = $("codes").onchange = () => {
  if (live) stopRun();
  updateInfo();
  $("send-status").textContent = "";
};
$("fps").onchange = () => {
  $("fps").value = fps();
};

$("start").onclick = () => {
  fail("");
  paused = false;
  if (!startStream()) return;
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

// ---------- the sender's camera ----------
//
// The sender watches the receiver's screen while it keeps sending. Nothing waits on it.
// Frames go to a worker, the answer comes back whenever it comes, and a missing or late
// answer changes nothing about what is on the screen.

const TX_SCAN_MS = 150;
const txVideo = $("tx-video");
const txGrab = document.createElement("canvas");
let txStream = null;
let txGen = 0;
let txId = 0;
let txLastSeq = -1;
let txActedAt = 0;
const txPool = new DecodeWorkerPool(
  () => new Worker(new URL("./rx-worker.js", import.meta.url)),
  (bytes) => onAckFrame(bytes),
  () => {},
  () => {},
);

function onAckFrame(bytes) {
  const ack = parseAck(bytes);
  if (!ack || !live || ack.sessionId !== live.sessionId || ack.k !== live.k)
    return;
  const now = performance.now();
  // The same answer again proves the link is up. It is only acted on again after the
  // retry window, so a replay that was lost again gets asked for once more.
  if (
    ack.seq === txLastSeq &&
    linkAlive() &&
    now - txActedAt < REPLAY_RETRY_MS
  ) {
    peer.at = now;
    return;
  }
  txLastSeq = ack.seq;
  txActedAt = now;
  const missing = ack.runs.reduce((sum, r) => sum + r.count, 0);
  peer = { seq: ack.seq, solved: ack.solved, k: ack.k, missing, at: now };
  if (ack.done) {
    finishSend();
    return;
  }
  const asked = live.onAck(ack);
  if (asked)
    $("tx-peer").textContent = `Receiver asked for ${asked} blocks again.`;
}

function finishSend() {
  stopRun();
  stopTxCamera();
  if (document.fullscreenElement) document.exitFullscreen();
  $("send-status").textContent =
    "The receiver confirmed it has the whole file. Sending stopped.";
}

function txScan(gen) {
  if (gen !== txGen) return;
  const vw = txVideo.videoWidth;
  const vh = txVideo.videoHeight;
  if (vw && vh && txPool.busyCount < txPool.size) {
    if (txGrab.width !== vw || txGrab.height !== vh) {
      txGrab.width = vw;
      txGrab.height = vh;
    }
    const ctx = txGrab.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(txVideo, 0, 0);
    const img = ctx.getImageData(0, 0, vw, vh);
    txPool.submit(
      {
        id: txId++,
        buf: img.data.buffer,
        w: vw,
        h: vh,
        ox: 0,
        oy: 0,
        full: true,
      },
      [img.data.buffer],
    );
  }
  setTimeout(() => txScan(gen), TX_SCAN_MS);
}

function stopTxCamera() {
  txGen++;
  for (const t of txStream?.getTracks() ?? []) t.stop();
  txStream = null;
  txVideo.srcObject = null;
  txPool.resize(0);
  txLastSeq = -1;
  $("tx-cam").textContent = "Start camera";
  $("tx-peer").textContent = "";
}

$("tx-cam").onclick = async () => {
  fail("");
  if (txStream) {
    stopTxCamera();
    return;
  }
  const blocked = insecureMessage();
  if (blocked) {
    fail(blocked);
    return;
  }
  try {
    txStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 960 },
        height: { ideal: 720 },
        frameRate: { ideal: 15 },
      },
    });
    txVideo.srcObject = txStream;
    await txVideo.play();
  } catch (e) {
    stopTxCamera();
    fail(cameraError(e));
    return;
  }
  txPool.resize(1);
  $("tx-cam").textContent = "Stop camera";
  txScan(++txGen);
};

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
  $("send-status").textContent = "Stopped. Press Start transfer to send again.";
  updateInfo();
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
let high = -1; // the highest block number read so far, which bounds what can be missing
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
    finSeen = false;
    high = -1;
    startedAt = performance.now();
    rateWindow = [];
  }
  if (header.seq < header.k) high = Math.max(high, header.seq);
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
}

// Frame rate is demanded exactly first, because some phones answer a polite request for
// 60 fps with 30. The retry takes whatever the camera can give.
async function acquireCamera() {
  const base = {
    facingMode: "environment",
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

function insecureMessage() {
  if (window.isSecureContext && navigator.mediaDevices?.getUserMedia) return "";
  return `The browser blocks the camera on this address (${location.origin}). Open the page over https:// or on localhost. A LAN address such as http://192.168.x.x and file:// do not work.`;
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
  const blocked = insecureMessage();
  if (blocked) {
    $("rx-error").textContent = blocked;
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
  high = -1;
  ackKey = "";
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

// ---------- the receiver's ACK code ----------
//
// The receiver keeps a small QR code on its own screen for the sender's camera. It is
// redrawn on a timer of its own, so decoding never waits for it and it never waits for
// decoding. It names the runs of blocks missing below the highest block seen, which are
// blocks the sender has already shown once.

const ACK_EVERY_MS = 250;
const ACK_WIDTH_PX = 300;
let ackSeq = 0;
let ackKey = "";

function updateAck() {
  const wrap = $("ack-wrap");
  if (!decoder) {
    wrap.hidden = true;
    return;
  }
  const finished = !!result;
  const gaps = finished ? [] : findGaps(decoder.solved.slice(0, high + 1));
  const runs = gaps.slice(0, ACK_MAX_RUNS);
  const solved = finished ? decoder.k : decoder.solvedCount;
  const key = `${decoder.sessionId}|${solved}|${finished}|${runs.map((r) => `${r.start}/${r.count}`)}`;
  if (key === ackKey) return;
  ackKey = key;
  ackSeq = (ackSeq + 1) & 0xffff;
  const qr = createFrameQr(
    packAck({
      sessionId: decoder.sessionId,
      k: decoder.k,
      seq: ackSeq,
      solved,
      done: finished,
      runs,
    }),
    "L",
    undefined,
  );
  const raster = rasterizeQr(qr.modules.size, qr.modules.data, MARGIN);
  const cv = $("ack");
  cv.width = cv.height = raster.size;
  cv.getContext("2d").putImageData(
    new ImageData(
      new Uint8ClampedArray(raster.pixels.buffer),
      raster.size,
      raster.size,
    ),
    0,
    0,
  );
  const px = raster.size * Math.max(1, Math.floor(ACK_WIDTH_PX / raster.size));
  cv.style.width = cv.style.height = `${px}px`;
  wrap.hidden = false;
}
setInterval(updateAck, ACK_EVERY_MS);

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
  $("download").hidden = !result;
  if (result) $("download").textContent = `Download ${result.file.name}`;
}
