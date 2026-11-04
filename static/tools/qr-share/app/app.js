// UI glue for the color code file transfer tool. All data stays in page memory.
// The codec is libcimbar (WASM). The encoder runs in tx-worker.js, the camera decoder in
// rx-worker.js, and the fountain decoder in sink-worker.js. This page only wires them up.
// All text that comes from a code is written with textContent, never innerHTML.

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

const MODE_NAMES = { 68: "B", 66: "Bu", 67: "Bm", 4: "4C" };
const DEFAULT_MODE = 68;

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

let tx = null;
let payload = 0; // bytes of code data per frame in the current mode
let encoded = false;
let paused = false;
let sendStart = 0;

function updateInfo() {
  const file = $("file").files[0];
  if (!file || !payload) return;
  $("send-info").textContent =
    `${file.name}: ${fmtBytes(file.size)}. Each frame carries ${payload} B of code data.`;
}

function setIdle(idle) {
  $("start").disabled = !idle || !encoded;
  $("pause").disabled = $("reset-send").disabled = idle;
}

function stopRun() {
  tx?.postMessage({ type: "stop" });
  paused = false;
  $("pause").textContent = "Pause";
  $("send-rate").textContent = "";
  setIdle(true);
}

function startSender() {
  if (!$("code").transferControlToOffscreen) {
    $("send-info").textContent = "";
    $("send-error").textContent =
      "This browser has no OffscreenCanvas, so the sender cannot run. Use a current Chrome, Firefox or Safari.";
    return;
  }
  tx = new Worker(new URL("./tx-worker.js", import.meta.url));
  tx.onerror = (e) => {
    $("send-error").textContent = `The encoder stopped: ${e.message}`;
  };
  tx.onmessage = ({ data }) => {
    // A placeholder canvas keeps its own size, so give it the proportions of the real one.
    if (data.ratio) $("code").style.aspectRatio = data.ratio;
    switch (data.type) {
      case "ready": {
        for (const { mode, payload: size } of data.modes) {
          const option = document.createElement("option");
          option.value = mode;
          option.textContent = `${MODE_NAMES[mode]}, ${size} B per frame`;
          $("mode").append(option);
        }
        $("mode").value = DEFAULT_MODE;
        payload = data.modes.find((m) => m.mode === DEFAULT_MODE).payload;
        $("mode").disabled = $("file").disabled = false;
        $("send-info").textContent = "Choose a file.";
        if ($("file").files[0]) prepare();
        break;
      }
      case "mode":
        payload = data.payload;
        updateInfo();
        break;
      case "encoded":
        encoded = true;
        payload = data.payload;
        updateInfo();
        $("send-status").textContent =
          "Ready. Press Start transfer when the receiver is ready.";
        setIdle(true);
        break;
      case "stats":
        if (paused) break;
        $("send-rate").textContent =
          `Transfer rate: ${fmtRate(data.fps * payload)} (${data.fps} frames/s)`;
        $("send-status").textContent =
          `Sending for ${Math.round((performance.now() - sendStart) / 1000)} s. Press Reset when the receiver says Done.`;
        break;
      case "error":
        $("send-error").textContent = data.message;
        $("send-info").textContent = "";
        break;
    }
  };
  // The canvas now belongs to the worker. The page only scales it with CSS.
  const canvas = $("code").transferControlToOffscreen();
  tx.postMessage({ type: "init", canvas }, [canvas]);
}

function prepare() {
  const file = $("file").files[0];
  if (!file || !tx) return;
  stopRun();
  encoded = false;
  setIdle(true);
  $("send-error").textContent = "";
  $("send-status").textContent = "";
  $("send-info").textContent = "Compressing and encoding...";
  tx.postMessage({ type: "file", file });
}

$("code").onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else $("code").parentElement.requestFullscreen?.();
};

$("file").onchange = prepare;
$("mode").onchange = () =>
  tx?.postMessage({ type: "mode", mode: Number($("mode").value) });
$("fps").oninput = () => tx?.postMessage({ type: "fps", fps: fps() });
$("fps").onchange = () => {
  $("fps").value = fps();
  tx?.postMessage({ type: "fps", fps: fps() });
};

$("start").onclick = () => {
  $("send-error").textContent = "";
  paused = false;
  sendStart = performance.now();
  $("send-rate").textContent = "Transfer rate: measuring...";
  setIdle(false);
  tx.postMessage({ type: "play", fps: fps() });
};

$("pause").onclick = () => {
  paused = !paused;
  tx.postMessage({ type: paused ? "pause" : "resume" });
  $("pause").textContent = paused ? "Resume" : "Pause";
  if (paused) {
    $("send-rate").textContent = "Transfer rate: paused";
    $("send-status").textContent = "Paused. Press Resume to continue.";
  }
};

$("reset-send").onclick = () => {
  stopRun();
  $("send-status").textContent = "Stopped. Press Start transfer to send again.";
};

startSender();

// ---------- receiver ----------
//
// The camera is never slowed down by decoding. Every camera frame goes to an idle worker as
// a bitmap. If every worker is busy, the frame is dropped and counted, never queued.
// Decoded blocks go to one sink worker that runs libcimbar's fountain decoder. The fountain
// code needs no frame numbers: any sufficient set of blocks rebuilds the file.

const MODE_CYCLE = [68, 66, 67, 4];
const POOL = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));

const video = $("video");
let stream = null;
let workers = [];
let sink = null;
let sinkReady = false;
let lockedMode = 0; // 0 while the mode is unknown. Then the receiver tries each one in turn.
let counter = 0;
let result = null;
let progress = 0;
let firstAt = 0; // time of the first new block
let doneAt = 0;
let seen = new Set();
let rateWindow = [];
const stats = { camera: 0, results: 0, read: 0, skipped: 0, ms: 0 };

// Identical blocks carry nothing new, so a frozen sender screen does not count as progress.
function fingerprint(buff) {
  let h = 2166136261;
  for (let i = 0; i < buff.length; i++) h = Math.imul(h ^ buff[i], 16777619);
  return `${buff.length}:${h >>> 0}`;
}

function onBlock(buff, mode) {
  if (!sinkReady) return;
  lockedMode = mode;
  const key = fingerprint(buff);
  if (seen.has(key)) return;
  seen.add(key);
  const now = performance.now();
  if (!firstAt) firstAt = now;
  rateWindow.push([now, buff.length]);
  sink?.postMessage({ type: "blocks", buff, mode }, [buff.buffer]);
  requestRender();
}

function startSink() {
  sink?.terminate();
  sinkReady = false;
  sink = new Worker(new URL("./sink-worker.js", import.meta.url));
  sink.onmessage = ({ data }) => {
    switch (data.type) {
      case "ready":
        sinkReady = true;
        break;
      case "progress":
        progress = data.progress;
        requestRender();
        break;
      case "done":
        result = { name: data.name, blob: data.blob };
        doneAt = performance.now();
        progress = 1;
        stopCamera();
        sink?.terminate();
        sink = null;
        sinkReady = false;
        render();
        break;
      case "error":
        $("rx-error").textContent = data.message;
        break;
    }
  };
  sink.onerror = (e) => {
    $("rx-error").textContent = `The decoder stopped: ${e.message}`;
  };
}

function startWorkers() {
  workers = Array.from({ length: POOL }, () => {
    const w = new Worker(new URL("./rx-worker.js", import.meta.url));
    w.ready = false;
    w.busy = false;
    w.onmessage = ({ data }) => {
      if (data.type === "ready") {
        w.ready = true;
      } else if (data.type === "error") {
        $("rx-error").textContent = data.message;
      } else {
        w.busy = false;
        stats.results++;
        stats.ms += data.ms;
        if (data.buff) {
          stats.read++;
          onBlock(data.buff, data.mode);
        }
      }
    };
    w.onerror = (e) => {
      $("rx-error").textContent = `The decoder stopped: ${e.message}`;
    };
    return w;
  });
}

function stopCamera() {
  for (const t of stream?.getTracks() ?? []) t.stop();
  stream = null;
  video.srcObject = null;
  for (const w of workers) w.terminate();
  workers = [];
}

function grab() {
  if (!sinkReady) return;
  stats.camera++;
  const w = workers.find((x) => x.ready && !x.busy);
  if (!w) {
    stats.skipped++;
    return;
  }
  w.busy = true;
  const mode = lockedMode || MODE_CYCLE[counter++ % MODE_CYCLE.length];
  createImageBitmap(video).then(
    (bitmap) => w.postMessage({ type: "frame", bitmap, mode }, [bitmap]),
    () => {
      w.busy = false;
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
  const now = performance.now();
  rateWindow = rateWindow.filter(([t]) => now - t <= 1000);
  if (stream && firstAt && !result) {
    // Average over the last second, or over the time so far when the transfer is younger.
    const span = Math.min(1000, now - firstAt) / 1000;
    const bytes = rateWindow.reduce((sum, [, n]) => sum + n, 0);
    $("rx-rate").textContent =
      span > 0.2 ? `Transfer rate: ${fmtRate(bytes / span)}` : "";
  }
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
        width: { ideal: 1920 },
        height: { ideal: 1080 },
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
  startWorkers();
  if (!sink && !result) startSink();
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

// The fountain decoder keeps its state inside the WASM module, so a reset starts a new worker.
$("reset").onclick = () => {
  sink?.terminate();
  sink = null;
  sinkReady = false;
  if (stream) startSink();
  result = null;
  progress = 0;
  firstAt = doneAt = 0;
  lockedMode = 0;
  seen = new Set();
  rateWindow = [];
  $("rx-rate").textContent = "";
  $("rx-error").textContent = "";
  render();
};

$("download").onclick = () => {
  const url = URL.createObjectURL(result.blob);
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

function render() {
  let status = "Camera is off.";
  if (result) status = "Done. libcimbar rebuilt and decompressed the file.";
  else if (firstAt) status = "Receiving...";
  else if (stream) status = "Point the camera at the code on the sender.";
  $("rx-status").textContent = status;

  if (result) {
    const seconds = (doneAt - firstAt) / 1000;
    $("rx-rate").textContent =
      `Average rate: ${fmtRate(result.blob.size / Math.max(seconds, 0.001))} (${fmtBytes(result.blob.size)} in ${seconds.toFixed(1)} s)`;
    $("rx-info").textContent =
      `File: ${result.name}\nSize: ${result.blob.size} B`;
  } else {
    $("rx-info").textContent = firstAt
      ? `Progress: ${Math.round(progress * 100)}%\nBlocks received: ${seen.size}`
      : "";
  }
  $("download").hidden = !result;
  if (result) $("download").textContent = `Download ${result.name}`;
}
