---
title: "QR file share"
date: 2026-11-03
description: "Send a file between two screens with animated QR codes. No network, no server."
---

This tool moves a file from one device to another through a stream of QR codes.
The sender shows the codes on a screen, and the receiver reads them with a camera.
Packing, checks, and reassembly all happen in browser memory.
The page makes no network requests after it has loaded, so you can turn the network off before the transfer starts.

[Open the tool](app/)

## How to use it

1. Open the tool on both devices. There is nothing to switch. A page waits with its camera on. The browser asks for camera permission the first time.
2. On the device that has the file, choose it. That page becomes the sender. It shows one META code that names the file and holds the data back. You can change the bytes per frame and the number of codes on screen. The defaults are 1,465 bytes, one code, and 30 frames per second.
3. Face the two screens toward each other's cameras. The sender's camera turns on once a file is chosen. A waiting page uses the back camera and a sender uses the front camera. If the device has more than one camera, a Camera list appears and lets you pick another.
4. Nothing else is needed, and there is no Start button. The waiting page reads the META code, becomes the receiver, and shows an ACK code. The sender reads that answer and starts sending. The receiver keeps the ACK code on its screen with how many blocks it has and which runs it lacks. The sender reads that while it keeps sending, plays the missing blocks in between, and stops by itself when the receiver says the file is complete. Nothing pauses for this. If the link drops, the sender keeps sending as before.
   Click the code to show it full screen. A browser only allows full screen after a click. In full screen the keys still work. Space pauses and resumes. Left and Right step one frame while paused. Up and Down change the speed by 5 fps. A line in the corner shows the state.
5. Keep both devices still. The receiver shows its progress and the transfer rate.
6. Without the sender's camera you can do the same by hand. Wait for the FIN code. It is a QR code that fills the screen for a second after each pass over the file. The receiver reads it and lists the runs of blocks it still lacks, longest first, such as `120/30/300/6`. Type that into the Play again field on the sender and press Replay. The sender plays those frames first, shows a FIN code again, and goes back to where it was.
7. When the receiver says Done, it has checked the SHA-256 of the file. Press Download.

## Notes

- The camera needs https or localhost.
- The file is cut into blocks and mixed with a fountain code. Each frame carries a random mix of blocks, and the receiver can rebuild the file from any set of frames that is large enough. A frame the camera misses costs a little time and nothing else.
- The sender repeats the stream until you press Reset, so replay is optional. Without it the receiver waits for repair frames. Their number grows with the size of the file, not with the size of the gap, so on a file of several MiB a short loss can cost hundreds of frames. A replay costs only the missing frames.
- A FIN code starts with a byte that Decimen does not use. A plain Decimen receiver ignores it without a message.
- A smaller frame makes a smaller QR code. Its cells are larger on the screen, so a phone camera can tell them apart more easily. A larger frame carries more data per code but needs a sharper picture.
- Showing two or four codes at once multiplies the data rate. Each code is smaller on the screen, so this works best with a steady camera and a large screen.
- The sender keeps each frame on screen for a whole frame interval and flips the codes in a grid one after the other. A camera exposure that spans a flip then catches at most one code half changed.
- Files up to 64 MB are accepted. They are compressed with gzip when that helps.
- The receiver decodes in worker threads. After it finds a code, it cuts the next camera frames down to a box around that code, and the decoder reads the code from its last four corners without searching. The page shows how many camera frames arrived, how many were decoded, and how many were dropped because every worker was busy.
- Screen and camera clocks are not synchronized. The camera should run at twice the sender rate or more. The receiver asks for 60 fps, and the phone may give less.
- QR error correction is kept at the lowest level on purpose. A damaged frame is thrown away, and the fountain code makes up for it.
- The protocol, the fountain code, and the QR decoder come from [Decimen Optical Transfer](https://github.com/bashalarmistalt/decimen-optical-transfer), which uses the AGPL-3.0 license.
- The code of this tool that uses them is under the same license. The files and notices are in the `vendor` folder of the tool.
- The idea of QR file transfer comes from [Airgapped QR code Transfer](https://github.com/mohankumarelec/Airgapped-QR-code-Transfer).
