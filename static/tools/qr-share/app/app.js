// UI glue for the QR file transfer tool. All data stays in page memory.
// All text from the QR codes is written with textContent, never innerHTML.
import { Receiver, parseMissing, prepareTransfer } from "./protocol.js";

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi, fallback) =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : fallback));

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
let timer = null;
let prepId = 0;

function drawQR(text) {
  const qr = qrcode(0, "M"); // type 0 = smallest version that fits
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  const scale = Math.max(2, Math.floor(560 / (n + 8))); // 4 module quiet zone on each side
  const size = (n + 8) * scale;
  const canvas = $("qr");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, size, size);
  g.fillStyle = "#000";
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(r, col))
        g.fillRect((col + 4) * scale, (r + 4) * scale, scale, scale);
    }
  }
}

const fps = () => clamp(parseInt($("fps").value, 10), 1, 15, 4);

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
  clearTimeout(timer);
  $("send-error").textContent = "";
  $("start").disabled = $("replay").disabled = true;
  $("send-info").textContent = "Compressing...";
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const chunk = clamp(parseInt($("chunk").value, 10), 100, 1500, 500);
    const next = await prepareTransfer(file.name, data, chunk);
    if (id !== prepId) return;
    transfer = next;
    drawQR(transfer.frames[0]);
    updateInfo();
    $("send-status").textContent =
      "Show this metadata code to the receiver. Press Start when the receiver is ready.";
    $("start").disabled = $("replay").disabled = false;
  } catch (e) {
    if (id === prepId) $("send-error").textContent = e.message;
  }
}

function play(indexes) {
  const delay = 1000 / fps();
  const buttons = [$("start"), $("replay")];
  buttons.forEach((b) => (b.disabled = true));
  let k = 0;
  const step = () => {
    if (k >= indexes.length) {
      drawQR(transfer.frames[0]); // back to metadata: this tells the receiver the pass is over
      $("send-status").textContent =
        "Pass finished. If the receiver shows missing numbers, enter them below.";
      buttons.forEach((b) => (b.disabled = false));
      return;
    }
    drawQR(transfer.frames[indexes[k]]);
    $("send-status").textContent =
      `Frame ${indexes[k]} / ${transfer.meta.count} (${k + 1} of ${indexes.length} in this pass)`;
    k++;
    timer = setTimeout(step, delay);
  };
  step();
}

$("file").onchange = prepare;
$("chunk").onchange = prepare;
$("fps").oninput = updateInfo;
$("start").onclick = () => {
  $("send-error").textContent = "";
  play(Array.from({ length: transfer.meta.count }, (_, i) => i + 1));
};
$("replay").onclick = () => {
  $("send-error").textContent = "";
  try {
    play(
      parseMissing($("missing-in").value, transfer.tid, transfer.meta.count),
    );
  } catch (e) {
    $("send-error").textContent = e.message;
  }
};

// ---------- receiver ----------

const rx = new Receiver();
const video = $("video");
const scanCanvas = $("scan");
const scanCtx = scanCanvas.getContext("2d", { willReadFrequently: true });
let stream = null;
let detector = null;
let result = null;
let assembling = false;
let failed = false;
let forceMissing = false;

async function scanOnce() {
  if (video.readyState < 2) return null;
  if (detector) {
    try {
      return (await detector.detect(video))[0]?.rawValue ?? null;
    } catch {
      return null;
    }
  }
  const k = Math.min(1, 1280 / video.videoWidth);
  const w = Math.round(video.videoWidth * k);
  const h = Math.round(video.videoHeight * k);
  scanCanvas.width = w;
  scanCanvas.height = h;
  scanCtx.drawImage(video, 0, 0, w, h);
  const img = scanCtx.getImageData(0, 0, w, h);
  return (
    jsQR(img.data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null
  );
}

function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

async function loop() {
  while (stream) {
    const text = await scanOnce();
    if (text && stream) handle(text);
    await new Promise(requestAnimationFrame);
  }
}

$("cam").onclick = async () => {
  $("rx-error").textContent = "";
  if (stream) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    if (
      window.BarcodeDetector &&
      (await BarcodeDetector.getSupportedFormats()).includes("qr_code")
    ) {
      detector = new BarcodeDetector({ formats: ["qr_code"] });
    }
  } catch (e) {
    stopCamera();
    $("rx-error").textContent =
      `Camera error: ${e.message}. The camera needs https or localhost.`;
    return;
  }
  render();
  loop();
};

$("reset").onclick = () => {
  rx.reset();
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

function handle(text) {
  const event = rx.feed(text);
  if (event === "duplicate" || event === "foreign") return;
  render();
  if (rx.complete() && !result && !assembling && !failed) finish();
}

async function finish() {
  assembling = true;
  try {
    result = await rx.assemble();
    stopCamera();
    render();
  } catch (e) {
    failed = true;
    $("rx-error").textContent = e.message;
  } finally {
    assembling = false;
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
    status = "Point the camera at the metadata QR code on the sender.";
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
