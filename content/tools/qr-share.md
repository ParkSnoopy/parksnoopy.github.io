---
title: "QR file share"
date: 2026-11-03
description: "Send a file between two screens with QR codes. No network, no server."
---

This tool moves a file from one device to another through QR codes.
The sender shows the codes on a screen, and the receiver reads them with a camera.
Compression, splitting, checks, and reassembly all happen in browser memory.
The page makes no network requests after it has loaded, so you can turn the network off before the transfer starts.

[Open the tool](app/)

## How to use it

1. Open the tool on both devices. Pick Send on one and Receive on the other.
2. On the sender, choose a file. The first QR code holds the file name, sizes, frame count, and a SHA-256 checksum.
3. On the receiver, press Start camera and point it at that code. The receiver shows the file and says it is ready.
4. On the sender, press Start transfer. The data frames play at the chosen speed. Keep the camera on the code.
5. If frames are missing or damaged, the receiver shows a short code such as `3F2A:3-5,9`. Type it into the sender and press Replay missing frames.
6. When every frame has arrived, the receiver checks the checksum, decompresses the data, and offers the download.

## Notes

- The camera needs https or localhost.
- Each frame carries its own CRC-32, so a damaged frame is dropped and counted as missing.
- Larger frames carry more data but need a sharper picture. Lower the frame size or the speed if the receiver misses frames.
- The receiver stops decompressing if the data grows past the size in the metadata.
- QR scanning uses the browser's native detector when it exists. Otherwise it uses [jsQR](https://github.com/cozmo/jsQR). Codes are drawn with [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator).
- The idea comes from [Airgapped QR code Transfer](https://github.com/mohankumarelec/Airgapped-QR-code-Transfer).
