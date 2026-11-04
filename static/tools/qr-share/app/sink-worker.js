// Collects decoded blocks with libcimbar's fountain decoder, then decompresses the file.
// In:  blocks { buff, mode }.
// Out: ready, progress { progress }, done { name, blob }, error { message }.
// The decoder keeps its state inside the module, so a reset means a new worker.

// The code is wrapped so its names cannot clash with the globals of the emscripten glue.
(() => {
  let lib = null;
  let inPtr = 0;
  let inCap = 0;
  let errPtr = 0;
  let lastMode = -1;
  const ERR_SIZE = 1024;

  self.Module = {
    locateFile: () => new URL("vendor/cimbar.wasm", self.location.href).href,
    print: () => {},
    printErr: () => {},
    onRuntimeInitialized() {
      lib = self.Module;
      errPtr = lib._malloc(ERR_SIZE);
      self.postMessage({ type: "ready" });
    },
  };
  importScripts("vendor/cimbar.js");

  // The report is a JSON array with one progress fraction per active transfer.
  function readProgress() {
    const len = lib._cimbard_get_report(errPtr, ERR_SIZE);
    if (len <= 0) return 0;
    try {
      const report = JSON.parse(
        new TextDecoder().decode(lib.HEAPU8.subarray(errPtr, errPtr + len)),
      );
      return Array.isArray(report) && report.length ? Number(report[0]) : 0;
    } catch {
      return 0;
    }
  }

  function finish(id) {
    let name = `${id}.${lib._cimbard_get_filesize(id)}`;
    const nameLen = lib._cimbard_get_filename(id, errPtr, ERR_SIZE);
    if (nameLen < 0)
      throw new Error(`The file could not be rebuilt (code ${nameLen}).`);
    if (nameLen > 0)
      name = new TextDecoder().decode(
        lib.HEAPU8.slice(errPtr, errPtr + nameLen),
      );

    const size = lib._cimbard_get_decompress_bufsize();
    const ptr = lib._malloc(size);
    const parts = [];
    try {
      for (;;) {
        const n = lib._cimbard_decompress_read(id, ptr, size);
        if (n < 0)
          throw new Error(`The file could not be decompressed (code ${n}).`);
        if (n === 0) break;
        parts.push(lib.HEAPU8.slice(ptr, ptr + n));
      }
    } finally {
      lib._free(ptr);
    }
    self.postMessage({ type: "done", name, blob: new Blob(parts) });
  }

  self.onmessage = ({ data }) => {
    if (!lib) return;
    try {
      // The chunk size depends on the mode, so set it before the first block.
      if (data.mode !== lastMode) {
        lib._cimbard_configure_decode(data.mode);
        lastMode = data.mode;
      }
      const len = data.buff.length;
      if (len > inCap) {
        if (inPtr) lib._free(inPtr);
        inPtr = lib._malloc(len);
        inCap = len;
      }
      lib.HEAPU8.set(data.buff, inPtr);
      // Returns the transfer id when the file is complete, 0 while it is not, negative for a bad block.
      const res = lib._cimbard_fountain_decode(inPtr, len);
      if (res < 0n) return;
      self.postMessage({ type: "progress", progress: readProgress() });
      if (res > 0n) finish(Number(res & 0xffffffffn));
    } catch (e) {
      self.postMessage({ type: "error", message: e.message });
    }
  };
})();
