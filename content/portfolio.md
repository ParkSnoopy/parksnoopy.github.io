---
title: "Portfolio"
description: "From a hand-written web server to AI-assisted dev tools."
---

I did not start with a plan.
I started with one small web app, and each project after it taught me the next thing.
This page follows that path.
Every project below is on [my GitHub](https://github.com/ParkSnoopy?tab=repositories).

## 1. Serving a web page myself

My first real projects were [AppOnRailway](https://github.com/ParkSnoopy/AppOnRailway) and [MyShareServer](https://github.com/ParkSnoopy/MyShareServer).
I wrote every line by hand.
I wanted a web page that I host and manage myself, not a page that someone else runs for me.

Getting there taught me the unglamorous half of software:

- how a request reaches my code, and how a response leaves it;
- how to deploy an app to a hosting platform and keep it running;
- how to fix it when it breaks and nobody else can.

## 2. Captchas, small CLIs, and Rust

Next I built things around captchas: [captcha-gen](https://github.com/ParkSnoopy/captcha-gen) makes the images and [captcha-solver](https://github.com/ParkSnoopy/captcha-solver) tries to read them.
Making a problem and then solving it is a good way to learn both sides.

Along the way I wrote small command-line tools for problems I had at the time:

- [rdp-shutdown](https://github.com/ParkSnoopy/rdp-shutdown): shut down a remote desktop machine at a set time.
- [rand_base64](https://github.com/ParkSnoopy/rand_base64): print random base64 strings.

These tools were small enough to finish in one sitting.
Most were written in Rust, and that is how I learned the language: one finished tool at a time.

## 3. Many projects, one habit

After Rust, I wrote many more projects: network tools, containers, desktop and mobile apps, and experiments with compilers.
Some lasted and some did not.
The habit that stayed is simple: when I need a tool, I build it, then I use it every day.

## 4. The AI era: building my own tooling

When AI coding agents became useful, my output changed.
I could now build the tools that I used to only wish for.
Two examples:

- [shareserver](https://github.com/ParkSnoopy/shareserver): the file-sharing idea from my first projects, built again with the experience of the years between.
- [debian-slim-zsh](https://github.com/ParkSnoopy/debian-slim-zsh): a small Debian container with zsh. It is my own isolated development workspace.

I still write and review the code that matters.
The agent handles the repetitive work, and I decide what to build.

## Selected projects

| Project | What it is |
| --- | --- |
| [AppOnRailway](https://github.com/ParkSnoopy/AppOnRailway) | My first web app, hosted on Railway |
| [MyShareServer](https://github.com/ParkSnoopy/MyShareServer) | My first share server, written by hand |
| [captcha-gen](https://github.com/ParkSnoopy/captcha-gen) | Captcha image generator |
| [captcha-solver](https://github.com/ParkSnoopy/captcha-solver) | Captcha image solver |
| [rdp-shutdown](https://github.com/ParkSnoopy/rdp-shutdown) | Timed shutdown for RDP machines |
| [rand_base64](https://github.com/ParkSnoopy/rand_base64) | Random base64 generator |
| [shareserver](https://github.com/ParkSnoopy/shareserver) | File sharing service, built again |
| [debian-slim-zsh](https://github.com/ParkSnoopy/debian-slim-zsh) | Debian development container with zsh |
