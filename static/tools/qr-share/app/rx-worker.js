// Finds the code in one camera image and decodes it with libcimbar, off the page thread.
// In:  frame { bitmap, mode }.
// Out: ready, result { buff, mode, ms } for every frame. buff is null when no code was read.

// The code is wrapped so its names cannot clash with the globals of the emscripten glue.
(() => {
  let ready = false;
  let canvas = null;
  let ctx = null;
  let lib = null;
  let imgPtr = 0;
  let imgCap = 0;
  let outPtr = 0;
  let outCap = 0;
  let lastMode = -1;

  self.Module = {
    locateFile: () => new URL("vendor/cimbar.wasm", self.location.href).href,
    print: () => {},
    printErr: () => {},
    onRuntimeInitialized() {
      lib = self.Module;
      ready = true;
      self.postMessage({ type: "ready" });
    },
  };
  importScripts("vendor/cimbar.js");

  function grow(ptr, cap, need) {
    if (need <= cap) return [ptr, cap];
    if (ptr) lib._free(ptr);
    return [lib._malloc(need), need];
  }

  function decode({ bitmap, mode }) {
    const { width, height } = bitmap;
    if (!canvas || canvas.width !== width || canvas.height !== height) {
      canvas = new OffscreenCanvas(width, height);
      ctx = canvas.getContext("2d", { willReadFrequently: true });
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = ctx.getImageData(0, 0, width, height).data;

    if (mode !== lastMode) {
      lib._cimbard_configure_decode(mode);
      lastMode = mode;
    }
    [imgPtr, imgCap] = grow(imgPtr, imgCap, pixels.length);
    [outPtr, outCap] = grow(outPtr, outCap, lib._cimbard_get_bufsize());
    lib.HEAPU8.set(pixels, imgPtr);
    // Format 4 is RGBA.
    const len = lib._cimbard_scan_extract_decode(
      imgPtr,
      width,
      height,
      4,
      outPtr,
      outCap,
    );
    return len > 0 ? lib.HEAPU8.slice(outPtr, outPtr + len) : null;
  }

  self.onmessage = ({ data }) => {
    const t0 = performance.now();
    if (!ready) {
      data.bitmap?.close();
      self.postMessage({ type: "result", buff: null, mode: data.mode, ms: 0 });
      return;
    }
    let buff = null;
    try {
      buff = decode(data);
    } catch (e) {
      self.postMessage({ type: "error", message: e.message });
    }
    self.postMessage(
      { type: "result", buff, mode: data.mode, ms: performance.now() - t0 },
      buff ? [buff.buffer] : [],
    );
  };
})();
