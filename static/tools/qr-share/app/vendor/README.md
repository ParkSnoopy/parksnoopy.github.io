# Vendored code

Everything here comes from [decimen-optical-transfer](https://github.com/bashalarmistalt/decimen-optical-transfer), commit `5301fc2020716b5a97d4edf6e1793c3dedbf6e17`, license AGPL-3.0-or-later. The full text is in `LICENSE.decimen-AGPL-3.0` and the notices are in `NOTICE.decimen`.

- `decimen_codec.wasm`: the QR decoder (a zxing-cpp build, Apache-2.0, see `LICENSE.zxing-cpp`). It is unmodified. Its JavaScript glue is bundled into `../rx-worker.js`.
- `decimen-core.js`: `shared/fountain.ts`, `shared/protocol.ts`, `shared/frame-capacity.ts`, `shared/qr-raster.ts`, `shared/worker-pool.ts`, `shared/progress.ts` and `send/qr-frame.ts` from that commit, bundled with [qrcode](https://github.com/soldair/node-qrcode) 1.5.4 (MIT).
- `../rx-worker.js`: `receive/worker.ts` from that commit, bundled with the decoder glue. `wasm-url.ts` is replaced by one line, `export default new URL("vendor/decimen_codec.wasm", self.location.href).href;`.

To rebuild, fetch those files at the commit above into one `src/` tree, install `qrcode@1.5.4` and `esbuild`, then run:

```sh
# src/core.ts re-exports the seven modules listed above
esbuild src/core.ts --bundle --format=esm --platform=browser --target=es2022 --minify-syntax --legal-comments=none --outfile=decimen-core.js
esbuild src/receive/worker.ts --bundle --format=iife --platform=browser --target=es2022 --legal-comments=none --outfile=rx-worker.js
```
