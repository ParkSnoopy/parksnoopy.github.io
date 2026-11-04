// Encodes a file with libcimbar and draws the animated code on an OffscreenCanvas.
// Compression, encoding and drawing all run here, so the page never blocks.
// In:  init { canvas }, mode { mode }, file { file, fps }, play { fps }, fps { fps },
//      pause, resume, stop.
// Out: ready { modes }, mode { payload }, encoded, stats { fps }, error { message }.

// The code is wrapped so its names cannot clash with the globals of the emscripten glue.
(() => {
  // libcimbar's GLFW layer expects a window and a document. A worker has neither.
  self.window = self;
  if (typeof self.matchMedia === "undefined") {
    self.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    });
  }
  if (typeof self.document === "undefined") {
    self.document = {
      fullscreenElement: null,
      mozFullScreenElement: null,
      webkitFullscreenElement: null,
      msFullscreenElement: null,
      getElementById: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
      visibilityState: "visible",
      hidden: false,
    };
  }

  const MODES = [68, 66, 67, 4];
  const DEFAULT_MODE = 68;
  const PART_SIZE = 10 * 1024 * 1024;
  const MAX_PARTS = 120;

  const fail = (message) => self.postMessage({ type: "error", message });
  const nextFrame =
    typeof self.requestAnimationFrame === "function"
      ? (cb) => self.requestAnimationFrame(cb)
      : (cb) => setTimeout(() => cb(performance.now()), 4);

  let lib = null;
  let mode = DEFAULT_MODE;
  let encoded = false;
  let source = null;
  let part = 0;
  let parts = 0;
  let transferId = "";
  let idBase = 0;
  let frameLimit = 0;
  let round = 0;

  // The page shows this canvas through a placeholder, which needs the real proportions.
  const ratio = () => self.Module.canvas.width / self.Module.canvas.height;

  self.Module = {
    canvas: null,
    locateFile: () => new URL("vendor/cimbar.wasm", self.location.href).href,
    print: () => {},
    printErr: () => {},
    onRuntimeInitialized() {
      lib = self.Module;
      try {
        if (lib._cimbare_init_window(0, 0) < 0)
          throw new Error("WebGL is not available for the OffscreenCanvas.");
        // The payload per frame is a property of the mode. Ask the library, do not hard-code it.
        const modes = MODES.map((m) => {
          lib._cimbare_configure(m, -1);
          return { mode: m, payload: lib._cimbard_get_bufsize() };
        });
        lib._cimbare_configure(DEFAULT_MODE, -1);
        self.postMessage({ type: "ready", modes, ratio: ratio() });
      } catch (e) {
        fail(e.message);
      }
    },
  };

  // ---------- encoding ----------

  // A new file cancels the one still being read. Both would write into the same encoder.
  let generation = 0;

  // Returns false when a newer file replaced this one.
  async function encodeFile(file, token) {
    const chunk = lib._cimbare_encode_bufsize() * 16;
    let estimate = file.size;
    if (part >= 0 && typeof CompressionStream !== "undefined") {
      estimate = 0;
      const reader = file
        .stream()
        .pipeThrough(new CompressionStream("deflate"))
        .getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (token !== generation) {
          await reader.cancel();
          return false;
        }
        if (done) break;
        estimate += value.byteLength;
      }
    }
    let name = part < 0 ? "cimbar-info-v1" : source.name;
    if (part >= 0) {
      const hash = new Uint8Array(
        await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
      );
      if (token !== generation) return false;
      const digest = Array.from(hash, (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      const filename = btoa(
        Array.from(new TextEncoder().encode(source.name), (b) =>
          String.fromCharCode(b),
        ).join(""),
      );
      name = `cimbar-part-v1.${transferId}.${part}.${parts}.${source.size}.${digest}.${filename}`;
    }
    name = new TextEncoder().encode(name);
    if (name.length > 1023)
      throw new Error("The file name is too long to transfer.");
    const namePtr = lib._malloc(Math.max(1, name.length));
    lib.HEAPU8.set(name, namePtr);
    const res = lib._cimbare_init_encode(
      namePtr,
      name.length,
      (idBase + part + 1) % 128,
    );
    lib._free(namePtr);
    if (res < 0) throw new Error(`The encoder could not start (code ${res}).`);

    const ptr = lib._malloc(chunk);
    try {
      // cimbare_encode answers 1 while more data is expected. A short or empty block finishes it.
      let code = 1;
      for (let offset = 0; code === 1; offset += chunk) {
        const block = new Uint8Array(
          await file.slice(offset, offset + chunk).arrayBuffer(),
        );
        if (token !== generation) return false;
        lib.HEAPU8.set(block, ptr); // read the heap after the await, it may have grown
        code = lib._cimbare_encode(ptr, block.length);
        if (code < 0)
          throw new Error(
            `libcimbar refused the file (code ${code}). One transfer holds about 33 MB after compression.`,
          );
      }
    } finally {
      lib._free(ptr);
    }
    encoded = true;
    // Deflate estimates zstd size; each pass increases redundancy up to the raw-size bound.
    const budget = Math.min(
      file.size * 1.8,
      estimate * 2.4 * 2 ** Math.min(round, 20),
    );
    frameLimit = Math.max(90, Math.ceil(budget / lib._cimbard_get_bufsize()));
    return true;
  }

  // ---------- playing ----------

  // The running pass retains playback and encoding state until stopped.
  let run = null;
  let raf = 0;
  let statsTimer = 0;
  let shownAt = [];

  function showFrame(now) {
    if (lib._cimbare_render() === 1) shownAt.push(now);
    lib._cimbare_next_frame(false);
  }

  // Frames change on screen refreshes only, so every frame stays up for a whole
  // number of refreshes. A timer would give uneven frame times and torn camera images.
  function tick(now) {
    raf = 0;
    if (!run || run.paused || run.encoding) return;
    const gap = 1000 / run.fps; // read each time, so a speed change applies at once
    if (run.due === 0) run.due = now;
    if (now + 4 >= run.due) {
      showFrame(now);
      run.due = now - run.due > gap ? now + gap : run.due + gap;
      if (!run.preview && ++run.frames >= frameLimit) {
        advance();
        return;
      }
    }
    raf = nextFrame(tick);
  }

  function reportStats() {
    const now = performance.now();
    shownAt = shownAt.filter((t) => now - t <= 1000);
    self.postMessage({ type: "stats", fps: shownAt.length });
  }

  function stop() {
    run = null;
    if (raf && typeof self.cancelAnimationFrame === "function")
      self.cancelAnimationFrame(raf);
    raf = 0;
    clearInterval(statsTimer);
    statsTimer = 0;
    shownAt = [];
  }

  function partBlob() {
    return part < 0
      ? new Blob([
          JSON.stringify({
            id: transferId,
            name: source.name,
            size: source.size,
            count: parts,
          }),
        ])
      : source.slice(part * PART_SIZE, (part + 1) * PART_SIZE, source.type);
  }

  async function advance() {
    const current = run;
    current.encoding = true;
    if (part + 1 >= parts) round++;
    part = part + 1 >= parts ? -1 : part + 1;
    self.postMessage({ type: "encoding", part: part + 1, parts });
    const token = ++generation;
    try {
      if (!(await encodeFile(partBlob(), token))) return;
      const running = run === current;
      self.postMessage({
        type: "encoded",
        payload: lib._cimbard_get_bufsize(),
        part: part + 1,
        parts,
        running,
      });
      if (running) {
        current.encoding = false;
        current.frames = 0;
        current.due = 0;
        if (!current.paused) raf = nextFrame(tick);
      }
    } catch (e) {
      if (token === generation) {
        stop();
        fail(e.message);
      }
    }
  }

  // ---------- messages ----------

  self.onmessage = async ({ data }) => {
    try {
      switch (data.type) {
        case "init":
          self.Module.canvas = data.canvas;
          importScripts("vendor/cimbar.js");
          break;
        case "mode":
          if (!lib) break;
          mode = data.mode;
          lib._cimbare_configure(mode, -1);
          self.postMessage({
            type: "mode",
            payload: lib._cimbard_get_bufsize(),
            ratio: ratio(),
          });
          break;
        case "file":
          stop();
          encoded = false;
          ++generation;
          source = data.file;
          parts = Math.max(1, Math.ceil(source.size / PART_SIZE));
          if (parts > MAX_PARTS)
            throw new Error(
              `The file exceeds the ${MAX_PARTS * 10} MiB transfer limit.`,
            );
          transferId = crypto.randomUUID();
          idBase = crypto.getRandomValues(new Uint8Array(1))[0] % 128;
          round = 0;
          part = -1;
          if (await encodeFile(partBlob(), ++generation)) {
            self.postMessage({
              type: "encoded",
              payload: lib._cimbard_get_bufsize(),
              part: part + 1,
              parts,
            });
            run = {
              fps: data.fps,
              due: 0,
              paused: false,
              preview: true,
              frames: 0,
              encoding: false,
            };
            raf = nextFrame(tick);
          }
          break;
        case "play":
          if (!encoded) break;
          if (!run) {
            run = {
              fps: data.fps,
              due: 0,
              paused: false,
              preview: false,
              frames: 0,
              encoding: false,
            };
            raf = nextFrame(tick);
          } else {
            run.fps = data.fps;
            run.preview = false;
            run.frames = 0;
          }
          statsTimer = setInterval(reportStats, 500);
          break;
        case "fps":
          if (run) run.fps = data.fps;
          break;
        case "pause":
          if (run) run.paused = true;
          break;
        case "resume":
          if (run?.paused) {
            run.paused = false;
            run.due = 0;
            raf = nextFrame(tick);
          }
          break;
        case "stop":
          stop();
          break;
      }
    } catch (e) {
      fail(e.message);
    }
  };
})();
