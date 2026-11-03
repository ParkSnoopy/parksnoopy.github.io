---
title: "Portfolio"
description: "Hand-written web servers, small Rust tools, and a few things I built for myself."
---

I did not start with a plan.
I started with one small web app, and every project after it taught me something the last one could not.
This page follows that path.
All of the code is on [my GitHub](https://github.com/ParkSnoopy?tab=repositories).

## Running my own web page

My first real projects were [AppOnRailway](https://github.com/ParkSnoopy/AppOnRailway) and [MyShareServer](https://github.com/ParkSnoopy/MyShareServer).
I wrote every line myself.
I wanted a page that I hosted and managed, not one that a platform ran for me.

That sounded easy until the app was live.
Then I had to learn how a request reaches my code, how to deploy it, and what to do when it breaks and nobody else will fix it.

## Captchas, small CLIs, and Rust

Next came captchas.
[captcha-gen](https://github.com/ParkSnoopy/captcha-gen) makes the images and [captcha-solver](https://github.com/ParkSnoopy/captcha-solver) tries to read them.
Building both sides is a good way to see where each one is weak.

At the same time I wrote small command-line tools for annoyances I had right then.
[rdp-shutdown](https://github.com/ParkSnoopy/rdp-shutdown) shuts down a remote desktop machine at a set time.
[rand_base64](https://github.com/ParkSnoopy/rand_base64) prints random base64 strings.
Each one was small enough to finish in a single sitting.
Most were written in Rust, and finishing them is how I learned the language.

After that I kept writing projects.
Some lasted and some did not.
The habit that stayed is simple: when I need a tool, I build it and then use it.

## One server, built twice

The share server idea kept coming back.
I wanted to share files without depending on an outside service.
So I wrote a [Django version](https://github.com/ParkSnoopy/django-shareserver) by hand, deployed it, and ran it.
I used it for real.

Running it showed me the costs.
It was heavy to run, and restarts were slow.
I went back over the Django design and rebuilt the backend in Go with SQLite.

Security was the harder part.
I wanted files encrypted in the browser, so the server only ever stores ciphertext.
That was complex to write by hand.
I wrote the requirements out as prompts and let an AI agent build the browser encryption and decryption, with storage kept separate on the server.
[shareserver](https://github.com/ParkSnoopy/shareserver) is the result.
It is lighter than the Django version and has more security features.

## Building my own tools

AI agents changed what I attempt.
Tools that I used to only wish for now get built.
[debian-slim-zsh](https://github.com/ParkSnoopy/debian-slim-zsh) is one of them: a small Debian container with zsh, and the workspace I develop in.

I still decide what to build, and I review the parts that matter.
The agent does the repetitive work.

## Other projects

### Love

[Love](https://github.com/ParkSnoopy/Love) is a Bible app that works offline.
It needs no account and no internet connection.
The text ships inside the app and search runs locally.
I planned it, built it, released it, and I use it myself.

The decision that mattered most was the data split.
The Bible text is read only, and my notes and bookmarks live in a separate store.
A content update cannot touch them.
I also added local backup and restore.

### PKU Elective Prettify

A university timetable export is flat and hard to read.
[pku-elective-prettify](https://github.com/ParkSnoopy/pku-elective-prettify) turns it into a colored timetable.
I split it into parsing, coloring, and output, so I could improve each one without touching the others.

The Python version needed an install and mostly suited Windows.
I rewrote it as a JavaScript web app to cut both problems.
Generating, editing, and exporting a timetable now happen in the browser, on [GitHub Pages](https://parksnoopy-undergraduate.github.io/elective/).

### Solarmax

Solarmax is a real-time strategy game in Python and Pygame.
Ships orbit and travel between planets, so I needed polar coordinates, ellipses, and tangent lines.
I had learned that math in class and never used it for anything.
I also taught myself classes and inheritance, to keep the state and behavior of the game objects under control.

### Researcher mobility and research funding visualization

This was a team project for a data visualization course.
Each member wrote their own visualization module.
I managed the shared codebase with branch merges and selective cherry-picks, so everyone's commits stayed in the history.

Manual deploys kept missing steps.
We split the code into a development repository and a deployment repository.
Then we set up GitHub Actions to check required assets, build the site, and publish it to GitHub Pages.
This site is deployed by GitHub Actions too.

## Selected projects

| Project | What it is |
| --- | --- |
| [AppOnRailway](https://github.com/ParkSnoopy/AppOnRailway) | My first web app, hosted on Railway |
| [MyShareServer](https://github.com/ParkSnoopy/MyShareServer) | My first share server, written by hand |
| [captcha-gen](https://github.com/ParkSnoopy/captcha-gen) | Captcha image generator |
| [captcha-solver](https://github.com/ParkSnoopy/captcha-solver) | Captcha image solver |
| [rdp-shutdown](https://github.com/ParkSnoopy/rdp-shutdown) | Timed shutdown for RDP machines |
| [rand_base64](https://github.com/ParkSnoopy/rand_base64) | Random base64 generator |
| [django-shareserver](https://github.com/ParkSnoopy/django-shareserver) | Share server, Django version |
| [shareserver](https://github.com/ParkSnoopy/shareserver) | Share server, Go version with browser-side encryption |
| [debian-slim-zsh](https://github.com/ParkSnoopy/debian-slim-zsh) | Debian development container with zsh |
| [Love](https://github.com/ParkSnoopy/Love) | Offline Bible app |
| [pku-elective-prettify](https://github.com/ParkSnoopy/pku-elective-prettify) | Colored timetable generator |
