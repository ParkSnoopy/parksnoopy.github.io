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

1. Open the tool on both devices. Pick Send on one and Receive on the other.
2. On the sender, choose a file. Pick the bytes per frame and how many codes to show at once. The defaults are 2,331 bytes, four codes, and 20 frames per second.
   As soon as the file is ready, the sender shows one META code under the picker. It carries the file name and size and no data.
3. On the receiver, press Start camera and point it at the META code. The receiver shows the file name once it has read it, so you know the aim is good. If the sender is far away, use the Zoom slider under the picture or pinch the picture. Zoom is the camera's own, so it only appears where the browser offers it. Most Android phones do. iPhones and most laptop cameras do not.
   Once the receiver has found the sender, its page becomes a panel that fills the screen, so the picture, the progress and the buttons are all in view without scrolling. Reset closes the panel.
4. On the sender, press Space or Start transfer. Click the code to show it full screen.
   In full screen the keys still work. Space pauses and resumes. Left and Right step one frame while paused. Up and Down change the speed by 5 fps. A line in the corner shows the state.
5. Keep both devices still. The receiver shows its progress and the transfer rate.
6. If the camera lost a stretch, wait for the FIN code. It is a QR code that fills the screen for a second after each pass over the file. The receiver reads it and lists the runs of blocks it still lacks, longest first, such as `120/30/300/6`. Type that into the Play again field on the sender and press Replay. The sender plays those frames first, shows a FIN code again, and goes back to where it was.
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
- The [TwoWay](../qr-share-twoway/) variant has no Send and Receive switch. The two devices watch each other with their cameras and the sender replays lost blocks by itself.
- The idea of QR file transfer comes from [Airgapped QR code Transfer](https://github.com/mohankumarelec/Airgapped-QR-code-Transfer).
