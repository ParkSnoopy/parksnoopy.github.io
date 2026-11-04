---
title: "Color code file share"
date: 2026-11-03
description: "Send a file between two screens with dense color codes. No network, no server."
---

This tool moves a file from one device to another through a stream of color codes.
The sender shows the codes on a screen, and the receiver reads them with a camera.
Compression, splitting, error correction, checks, and reassembly all happen in browser memory.
The page makes no network requests after it has loaded, so you can turn the network off before the transfer starts.

[Open the tool](app/)

## How to use it

1. Open the tool on both devices. Pick Send on one and Receive on the other.
2. On the sender, choose a file and a code size. The file is compressed with zstd. The first code holds the file name, sizes, frame count, code size, and a SHA-256 checksum.
3. On the receiver, press Start camera and point it at that code. The receiver shows the file and says it is ready.
4. On the sender, press Start transfer. The data frames play at the chosen speed. Keep the camera on the code. Click the code to show it full screen.
5. If frames are missing or damaged, the receiver shows the missing frame numbers, joined by `/`, such as `3/4/5/9`. Type them into the sender and press Replay missing frames.
6. When every frame has arrived, the receiver checks the checksum, decompresses the data, and offers the download.

## Notes

- The camera needs https or localhost.
- A code is a grid of cells. Each cell has one of eight colors, so it holds three bits. The largest grid holds about 5.2 KB per frame, against 1.7 KB for the largest QR code.
- Every frame has Reed-Solomon error correction (32 parity bytes per block of up to 255) and its own CRC-32. A frame that is still damaged is dropped and counted as missing.
- The receiver decodes in a worker thread and tracks the code between frames, so the camera is never kept waiting. The page shows how many camera frames were read and how many were dropped.
- A larger grid needs a sharper picture. If the receiver misses frames, pick a smaller grid, lower the speed, or move the camera closer.
- Screen and camera clocks are not synchronized. To catch every frame, the camera must run at twice the sender rate: a 60 fps camera for 30 fps, or 30 fps for 15. The receiver asks for 60 fps, and the phone may give less.
- When the camera is too slow, some frames are skipped or caught halfway through a change. They count as missing, and the replay step sends them again.
- The receiver stops decompressing if the zstd header announces a different size than the metadata.
- Compression uses [zstd-wasm](https://github.com/bokuweb/zstd-wasm) (Zstandard). The code format is built for this page and is not compatible with other tools.
- The idea comes from [Airgapped QR code Transfer](https://github.com/mohankumarelec/Airgapped-QR-code-Transfer) and from [libcimbar](https://github.com/sz3/libcimbar).
