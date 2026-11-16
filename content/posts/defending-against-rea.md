---

title: "Defending Against REA (Reverse Engineer Anything)"
date: 2026-11-03
description: "Why agent-assisted reverse engineering changed how I think about distributing software, and what I built in response."
tags: ["reverse-engineering", "rust", "security", "obfuscation"]
---

I used to think of reverse engineering as work that demanded a great deal of specialized attention. The tools were available, but someone still had to decide where to look, follow the evidence, and connect the pieces. REA made me reconsider what happens when an agent can take part in that work. My projects are an attempt to make the software I distribute less straightforward to understand and modify.

<!--more-->

## A Short Time Ago, Human did the things

Reverse engineering did not begin with AI agents. Disassemblers, decompilers, debuggers, and tracing tools have long made it possible to study software without its source code. An experienced analyst could examine a binary, test a hypothesis against a running program, and gradually work out where a behavior came from.

What limited that work was not simply access to tools. The analyst had to learn their way around an unfamiliar program and keep track of what each observation meant. A promising string might lead to a function, which might lead to another function, and only later reveal whether the original lead mattered. Even with good tools, that process took knowledge, patience, and time.

That effort was never a guarantee of protection. It was part of the practical distance between distributing a program and someone else understanding enough of it to change it.

## REA ERA

ArtCraft offers a concrete example of what building software with AI agents can look like. Its [PhotoCraft][photocraft] project aims to recreate Adobe Photoshop's image-editing workflow, while [VectorCraft][vectorcraft] and [FilmCraft][filmcraft] take on Illustrator and Premiere Pro. The team has also started reimplementing Microsoft Office applications: [WordCraft][wordcraft] for Word, [GridCraft][gridcraft] for Excel, and [DeckCraft][deckcraft] for PowerPoint. These are open-source applications that aim to reproduce familiar workflows and work with existing file formats. ArtCraft's developer has [described using Claude][artcraft-report] to build the Adobe alternatives.

ArtCraft describes its approach as clean-room development using sources such as public specifications and observed behavior. The applications are still being developed; matching a familiar interface does not mean every feature or file behaves like the original. What interests me is that a team can use agents to help investigate and build alternatives to software that once seemed far too large to reproduce without an equally large development effort.

[REA][rea], or Reverse Engineer Anything, is another expression of that shift: it connects agents to tools that help them investigate software and its behavior. ArtCraft's projects illustrate the broader possibility, while REA gives agents ways to examine programs more directly. For me, the important change is that finding out how software works and building on that understanding can involve much less manual effort than before.

## My Sublime Text issue

I ran into a problem with Sublime Text when opening a workspace containing several large repositories. The editor scanned the directory trees eagerly, and memory use grew quickly. The available settings did not stop the traversal I wanted to avoid.

In my [article about the patch][sublime], I investigated the executable and changed how it scanned folders. The patched editor kept the workspace shallow at startup and loaded a Git project when I expanded it. In my test with ten LLVM checkouts, memory after eight seconds fell from more than 305 MB and still growing to 139 MB.

The example stayed with me because the change was possible without the editor's source code. I could observe a problem, trace it to behavior in the binary, and alter that behavior. The result was useful to me; it also showed how much a distributed executable can reveal to someone able to inspect and run it.

REA makes that kind of investigation easier to organize. The Sublime Text experience helped me think about what agent-assisted reverse engineering could mean for the software I publish.

## Wait.. I have the tool somewhere in my drawer..

I had already worked on [rust_llvm-arkari_ollvm][arkari], which brings Arkari's obfuscation passes into Rust's LLVM toolchain. Obfuscation changes the compiled program so that some of its structure is less obvious to an analyst. The program still has to run, but the path from the executable back to a clear understanding of its logic can become less direct.

I built [cargo-rrea][rrea] to bring that idea into a Rust release workflow. It combines the obfuscating toolchain with other steps that make a release less convenient to inspect, including removing some metadata and packing the resulting artifacts. My goal is to make those measures usable as part of a build, rather than a collection of manual experiments after the fact.

I do not expect a tool to make a program impossible to reverse engineer. A person who controls the machine can run it, observe it, and modify it. Packing can be reversed, and obfuscation can carry a cost in performance or compatibility. My [evaluation][evaluation] records both the behavior I tested and the costs I observed; the project documentation covers the build options and their limits.

## The philosophy

I am not trying to make reverse engineering disappear. My Sublime Text work is an example of why being able to understand and change software can be useful. At the same time, publishing an executable gives others an artifact they can study, including when their goals are different from mine.

For me, defending against REA means taking that reality seriously. If agents make some investigations easier to start and coordinate, I want the release process to give me a way to make analysis more demanding. That is a question of cost and friction, not a promise that the binary holds a secret forever.

The distinction matters when deciding what belongs in the client. I would not rely on obfuscation to protect a long-lived secret or make a local authorization check authoritative. For logic that must run on someone else's machine, though, I still think it is reasonable to choose how much of its structure I expose and what trade-offs I am willing to accept to protect it.

[rea]: https://github.com/morluto/rea
[artcraft-report]: https://arstechnica.com/ai/2026/10/software-is-over-bold-ai-developer-takes-aim-at-adobe-with-open-source-clones/
[photocraft]: https://github.com/storytold/photocraft
[vectorcraft]: https://github.com/storytold/vectorcraft
[filmcraft]: https://github.com/storytold/filmcraft
[wordcraft]: https://github.com/storytold/wordcraft
[gridcraft]: https://github.com/storytold/gridcraft
[deckcraft]: https://github.com/storytold/deckcraft
[sublime]: https://gist.github.com/ParkSnoopy/fb46d844323165998d7ddb930aaf544e
[arkari]: https://github.com/ParkSnoopy/rust_llvm-arkari_ollvm
[rrea]: https://github.com/ParkSnoopy/cargo-rrea
[evaluation]: https://github.com/ParkSnoopy/cargo-rrea/blob/main/docs/evaluation.md
