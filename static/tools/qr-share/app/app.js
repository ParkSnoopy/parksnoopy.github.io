// UI glue for the color code file transfer tool. All data stays in page memory.
// All text that comes from a code is written with textContent, never innerHTML.
import { encodeCells, renderRGBA } from "./codec.js";
import {
  GRIDS,
  Receiver,
  loadZstd,
  parseMissing,
  payloadSize,
  prepareTransfer,
} from "./protocol.js";

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi, fallback) =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : fallback));

// Fetch zstd.wasm now, so no request is needed while a transfer runs.
loadZstd().catch(() => {});

// A pressed button must not stay highlighted. This also covers Pause and Reset.
document.addEventListener("click", (e) => e.target.closest("button")?.blur());

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

let transfer = null;
let prepId = 0;

const DEFAULT_GRID = 64;
for (const g of GRIDS) {
  const option = document.createElement("option");
  option.value = g;
  option.textContent = `${g} x ${g} cells, ${payloadSize(g)} B per frame`;
  $("grid").append(option);
}
$("grid").value = DEFAULT_GRID;

const FPS = { min: 1, max: 60, fallback: 30 };
$("fps").min = FPS.min;
$("fps").max = FPS.max;
$("fps-range").textContent = `${FPS.min} to ${FPS.max}`;

// Stop the user from typing a number above the limit. The lower bound is
// enforced on change, so a number can still be typed digit by digit.
$("fps").addEventListener("input", () => {
  if (Number.parseInt($("fps").value, 10) > FPS.max) $("fps").value = FPS.max;
});

const fps = () =>
  clamp(parseInt($("fps").value, 10), FPS.min, FPS.max, FPS.fallback);

function drawFrame(frame) {
  const G = transfer.meta.grid;
  const px = Math.max(3, Math.floor(720 / (G + 8)));
  const img = renderRGBA(encodeCells(frame, G), G, px);
  const canvas = $("code");
  if (canvas.width !== img.width) canvas.width = canvas.height = img.width;
  canvas
    .getContext("2d")
    .putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
}

$("code").onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else $("code").requestFullscreen?.();
};

function updateInfo() {
  if (!transfer) return;
  const { name, size, packed, count } = transfer.meta;
  $("send-info").textContent =
    `${name}: ${size} B, ${packed} B compressed, ${count} frames, about ${Math.ceil(count / fps())} s at ${fps()} frames per second.`;
}

async function prepare() {
  const file = $("file").files[0];
  if (!file) return;
  const id = ++prepId;
  stopRun();
  $("send-error").textContent = "";
  $("start").disabled = $("replay").disabled = true;
  $("send-info").textContent = "Compressing...";
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const next = await prepareTransfer(
      file.name,
      data,
      Number($("grid").value),
    );
    if (id !== prepId) return;
    transfer = next;
    drawFrame(transfer.frames[0]);
    updateInfo();
    $("send-status").textContent =
      "Show this metadata code to the receiver. Press Start when the receiver is ready.";
    $("start").disabled = $("replay").disabled = false;
  } catch (e) {
    if (id === prepId) $("send-error").textContent = e.message;
  }
}

// The running pass: { indexes, k, due } while frames play, null otherwise.
let run = null;
let paused = false;
let raf = 0;

function setIdle(idle) {
  $("start").disabled = $("replay").disabled = !idle;
  $("pause").disabled = $("reset-send").disabled = idle;
}

function stopRun() {
  cancelAnimationFrame(raf);
  raf = 0;
  run = null;
  paused = false;
  $("pause").textContent = "Pause";
  $("pause").disabled = $("reset-send").disabled = true;
}

// Returns false when the pass is over.
function showNext() {
  const { indexes, k } = run;
  if (k >= indexes.length) {
    stopRun();
    drawFrame(transfer.frames[0]); // back to metadata: this tells the receiver the pass is over
    $("send-status").textContent =
      "Pass finished. If the receiver shows missing numbers, enter them below.";
    setIdle(true);
    return false;
  }
  drawFrame(transfer.frames[indexes[k]]);
  $("send-status").textContent =
    `Frame ${indexes[k]} / ${transfer.meta.count} (${k + 1} of ${indexes.length} in this pass)`;
  run.k++;
  return true;
}

// Frames change on screen refreshes only, so every frame stays up for a whole
// number of refreshes. A timer would give uneven frame times and torn camera images.
function tick(now) {
  raf = 0;
  if (!run || paused) return;
  const gap = 1000 / fps(); // read each time, so a speed change applies at once
  if (run.due === 0) run.due = now;
  if (now + 4 >= run.due) {
    if (!showNext()) return;
    run.due = now - run.due > gap ? now + gap : run.due + gap;
  }
  raf = requestAnimationFrame(tick);
}

function play(indexes) {
  run = { indexes, k: 0, due: 0 };
  paused = false;
  setIdle(false);
  raf = requestAnimationFrame(tick);
}

$("pause").onclick = () => {
  if (!run) return;
  paused = !paused;
  if (paused) {
    cancelAnimationFrame(raf);
    raf = 0;
    $("pause").textContent = "Resume";
    $("send-status").textContent =
      `Paused after frame ${run.indexes[run.k - 1]}. Press Resume to continue.`;
  } else {
    $("pause").textContent = "Pause";
    run.due = 0;
    raf = requestAnimationFrame(tick);
  }
};

$("reset-send").onclick = () => {
  stopRun();
  drawFrame(transfer.frames[0]);
  $("send-status").textContent =
    "Reset. Show the metadata code again, then press Start transfer.";
  setIdle(true);
};

$("file").onchange = prepare;
$("grid").onchange = prepare;
$("fps").oninput = updateInfo;
$("fps").onchange = () => {
  $("fps").value = fps();
  updateInfo();
};
$("start").onclick = () => {
  $("send-error").textContent = "";
  play(Array.from({ length: transfer.meta.count }, (_, i) => i + 1));
};
$("missing-in").oninput = (e) => {
  e.target.value = e.target.value.replace(/[^0-9/]/g, "");
};
$("replay").onclick = () => {
  $("send-error").textContent = "";
  try {
    play(parseMissing($("missing-in").value, transfer.meta.count));
  } catch (e) {
    $("send-error").textContent = e.message;
  }
};

// ---------- receiver ----------
//
// The camera is never slowed down by decoding. Every camera frame goes to a worker as a
// bitmap, and the worker decodes it. The page only counts, stores and draws. If the worker
// is two frames behind, new camera frames are dropped and counted, never queued.

const rx = new Receiver();
const video = $("video");
let stream = null;
let worker = null;
let inflight = 0;
let result = null;
let assembling = false;
let failed = false;
let forceMissing = false;
const stats = { camera: 0, results: 0, read: 0, skipped: 0, ms: 0 };

function startWorker() {
  worker = new Worker(new URL("./rx-worker.js", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }) => {
    inflight--;
    stats.results++;
    stats.ms += data.ms;
    if (data.bytes) {
      stats.read++;
      handle(data.bytes);
    }
  };
  worker.onerror = (e) => {
    $("rx-error").textContent = `The decoder stopped: ${e.message}`;
  };
  if (rx.meta) worker.postMessage({ type: "grid", grid: rx.meta.grid });
}

function stopCamera() {
  for (const t of stream?.getTracks() ?? []) t.stop();
  stream = null;
  video.srcObject = null;
  worker?.terminate();
  worker = null;
  inflight = 0;
}

function grab() {
  stats.camera++;
  if (inflight >= 2) {
    stats.skipped++;
    return;
  }
  inflight++;
  createImageBitmap(video).then(
    (bitmap) => worker?.postMessage({ type: "frame", bitmap }, [bitmap]),
    () => {
      inflight--;
    },
  );
}

// One grab per new camera frame, not per screen refresh.
function pump() {
  if (video.requestVideoFrameCallback) {
    const next = () => {
      if (!stream) return;
      grab();
      video.requestVideoFrameCallback(next);
    };
    video.requestVideoFrameCallback(next);
    return;
  }
  let last = -1;
  const poll = () => {
    if (!stream) return;
    if (video.currentTime !== last) {
      last = video.currentTime;
      grab();
    }
    requestAnimationFrame(poll);
  };
  poll();
}

setInterval(() => {
  if (!stream) return;
  const { camera, results, read, skipped, ms } = stats;
  $("rx-stats").textContent =
    `Camera ${camera} frames/s, read ${read}/s, dropped while busy ${skipped}/s, decode ${results ? (ms / results).toFixed(1) : "0"} ms`;
  Object.assign(stats, { camera: 0, results: 0, read: 0, skipped: 0, ms: 0 });
}, 1000);

$("cam").onclick = async () => {
  $("rx-error").textContent = "";
  if (stream) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    $("rx-error").textContent =
      `The browser blocks the camera on this address (${location.origin}). Open the page over https:// or on localhost. A LAN address such as http://192.168.x.x and file:// do not work.`;
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
        // The camera must run at twice the sender rate to catch every frame.
        frameRate: { ideal: 60 },
      },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
  } catch (e) {
    stopCamera();
    $("rx-error").textContent = cameraError(e);
    return;
  }
  startWorker();
  render();
  pump();
};

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

$("reset").onclick = () => {
  rx.reset();
  worker?.postMessage({ type: "grid", grid: null });
  result = null;
  failed = false;
  forceMissing = false;
  $("rx-error").textContent = "";
  render();
};

$("show-missing").onclick = () => {
  forceMissing = true;
  render();
};

$("download").onclick = () => {
  const url = URL.createObjectURL(new Blob([result.bytes]));
  const a = document.createElement("a");
  a.href = url;
  a.download = result.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

let renderTimer = 0;
// Redraw at most ten times a second, whatever the frame rate is.
function requestRender() {
  if (renderTimer) return;
  renderTimer = setTimeout(() => {
    renderTimer = 0;
    render();
  }, 100);
}

function handle(bytes) {
  const event = rx.feed(bytes);
  if (event === "meta")
    worker?.postMessage({ type: "grid", grid: rx.meta.grid });
  if (event === "duplicate" || event === "foreign") return;
  requestRender();
  if (rx.complete() && !result && !assembling && !failed) finish();
}

async function finish() {
  assembling = true;
  try {
    result = await rx.assemble();
    stopCamera();
  } catch (e) {
    failed = true;
    $("rx-error").textContent = e.message;
  } finally {
    assembling = false;
    render();
  }
}

function render() {
  const m = rx.meta;
  const complete = rx.complete();
  let status = "Camera is off.";
  if (result) status = "Done. The data passed every check.";
  else if (complete) status = "All frames received. Checking...";
  else if (m && rx.ended) status = "The pass ended with missing frames.";
  else if (m && rx.received === 0)
    status = "Ready. Press Start transfer on the sender.";
  else if (m) status = "Receiving...";
  else if (stream)
    status = "Point the camera at the metadata code on the sender.";
  $("rx-status").textContent = status;

  $("rx-info").textContent = m
    ? `File: ${m.name}\nSize: ${m.size} B (${m.packed} B compressed)\nFrames: ${rx.received} / ${rx.total}\nUnreadable or damaged frames seen: ${rx.bad}`
    : "";

  const missing = m && !complete && (rx.ended || forceMissing);
  $("missing-box").hidden = !missing;
  if (missing) $("missing-out").textContent = rx.missingCode();
  $("show-missing").hidden = !m || complete || missing;
  $("download").hidden = !result;
  if (result)
    $("download").textContent =
      `Download ${result.name} (${result.bytes.length} B)`;
}
