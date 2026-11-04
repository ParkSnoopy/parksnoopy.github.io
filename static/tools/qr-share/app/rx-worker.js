// Finds the code in one camera image and decodes it with libcimbar, off the page thread.
// In:  frame { frame | bitmap, mode }. A VideoFrame is preferred, a bitmap is the fallback.
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

  // libcimbar's pixel format codes. Phone cameras deliver NV12 or I420.
  const NATIVE = { NV12: 12, I420: 420 };
  const RGBA = 4;

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

  // Sets the mode and makes room for the image and the decoded blocks.
  function prepare(mode, imageSize) {
    if (mode !== lastMode) {
      lib._cimbard_configure_decode(mode);
      lastMode = mode;
    }
    [imgPtr, imgCap] = grow(imgPtr, imgCap, imageSize);
    [outPtr, outCap] = grow(outPtr, outCap, lib._cimbard_get_bufsize());
  }

  function scan(width, height, type) {
    const len = lib._cimbard_scan_extract_decode(
      imgPtr,
      width,
      height,
      type,
      outPtr,
      outCap,
    );
    return len > 0 ? lib.HEAPU8.slice(outPtr, outPtr + len) : null;
  }

  // The camera frame goes straight into the WASM heap in its own format.
  async function decodeFrame({ frame, mode }) {
    try {
      const { width, height } = frame.visibleRect;
      let type = NATIVE[frame.format] ?? RGBA;
      let options = type === RGBA ? { format: "RGBA" } : {};
      let size = frame.allocationSize(options);
      // libcimbar reads NV12 and I420 as tightly packed planes. Odd sizes are not.
      if (type !== RGBA && size !== (width * height * 3) / 2) {
        type = RGBA;
        options = { format: "RGBA" };
        size = frame.allocationSize(options);
      }
      prepare(mode, size);
      await frame.copyTo(lib.HEAPU8.subarray(imgPtr, imgPtr + size), options);
      return scan(width, height, type);
    } finally {
      frame.close();
    }
  }

  function decodeBitmap({ bitmap, mode }) {
    const { width, height } = bitmap;
    if (!canvas || canvas.width !== width || canvas.height !== height) {
      canvas = new OffscreenCanvas(width, height);
      ctx = canvas.getContext("2d", { willReadFrequently: true });
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = ctx.getImageData(0, 0, width, height).data;
    prepare(mode, pixels.length);
    lib.HEAPU8.set(pixels, imgPtr);
    return scan(width, height, RGBA);
  }

  // The page sends one image per worker at a time, so a slow copy never overlaps the next.
  self.onmessage = async ({ data }) => {
    const t0 = performance.now();
    if (!ready) {
      data.bitmap?.close();
      data.frame?.close();
      self.postMessage({ type: "result", buff: null, mode: data.mode, ms: 0 });
      return;
    }
    let buff = null;
    try {
      buff = data.frame ? await decodeFrame(data) : decodeBitmap(data);
    } catch (e) {
      self.postMessage({ type: "error", message: e.message });
    }
    self.postMessage(
      { type: "result", buff, mode: data.mode, ms: performance.now() - t0 },
      buff ? [buff.buffer] : [],
    );
  };
})();
