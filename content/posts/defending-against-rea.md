---
title: "Defending Against REA (Reverse Engineer Anything)"
date: 2026-11-03
description: "What agent-assisted reverse engineering changes, and how Rust obfuscation raises the cost without making binaries secret."
tags: ["reverse-engineering", "rust", "security", "obfuscation"]
---

An executable does not need to expose its source code for someone to change its behavior. My binary patch to Sublime Text's directory scanner shows how much an analyst can learn from a program they can inspect and run. Agent-assisted tools such as REA make that workflow easier to coordinate. I want to make useful analysis more expensive without promising an unreadable binary or pretending the client is a trusted machine.

<!--more-->

## A patch without source code

My [Sublime Text patch article][sublime] documents a concrete case. Sublime Text 4 Build 4215 on Linux x86-64 recursively scanned a workspace with large repositories. The patch redirected two catalogue recursion calls and one sidebar branch to added code. The new code checked for `.git`, allowed recursive scans for an expanded Git project, and kept other folders shallow. It also changed an ELF program header to map executable hook code.

In a workspace with ten LLVM checkouts, RSS after eight seconds fell from more than 305 MB and rising to 139 MB. The article also includes `openat` traces of the resulting expansion behavior. The patch targets one particular binary build and its offsets.

Even without the original source, observing behavior, tracing calls, and changing a few branches can be enough to alter a program. The same client-side control matters when the behavior being changed is a proprietary algorithm or a local authorization decision.

## What REA changes

[REA][rea] connects an AI agent to reverse-engineering workflows through the Model Context Protocol (MCP), and also provides a command-line interface. For native binaries it can coordinate tools such as Ghidra, IDA, or Hopper to inspect strings, calls, assembly, and pseudocode. Its scope also includes applications, websites, and runtime observations. REA does not magically recover the original source: the agent interprets available evidence, asks follow-up questions, and may produce an incomplete or incorrect reconstruction.

Assume an analyst has a copy of the release, can run it with chosen inputs, and can examine or modify files and process memory. They may compare outputs, follow interesting strings and cross-references, inspect the loader, or patch a conditional branch. An agent can automate parts of that iteration. Obfuscation targets the cost of understanding those artifacts; it cannot prevent someone who controls the machine from observing the program's behavior.

## Build-time defense: Arkari for Rust

My [rust_llvm-arkari_ollvm][arkari] project combines Rust's LLVM fork with Arkari's obfuscation passes. A Rust compiler built against that backend can transform code during compilation, before it becomes a native executable. I provide Linux and Windows 64-bit release targets. Some passes have compatibility issues, including failures involving control-flow flattening and some dependencies.

The passes address different clues:

| Layer | What it changes | Cost and limit |
| --- | --- | --- |
| Indirect branches, calls, and globals | Replaces direct targets with indirection and encrypted target addresses. | Call and control-flow graphs become harder to follow, but targets must resolve at runtime. |
| Control-flow flattening | Reorganizes control flow around a dispatcher rather than the original branch structure. | Can increase execution cost or cause compatibility failures; a dispatcher can still be analyzed. |
| String and constant encryption | Transforms supported strings and integer or floating-point constants. | Plaintext or computed values may be visible when used; not every string is necessarily transformed. |
| Rust string fingerprint replacement | Optionally replaces selected namespace and source-path text in eligible byte-array constants. | It is not symbol renaming, does not cover every constant, and may affect application-visible data. |

These are transformations, not encryption of the entire running program. The passes do not rewrite precompiled libraries. Rebuilding the standard library with the matching compiler and flags is a separate requirement for applying them to that code. A pass that helps one project may break another, so test the actual release and dependencies rather than assuming that more passes are always better.

## Release pipeline: cargo-rrea

I built [cargo-rrea][rrea] to package these ideas as a Cargo subcommand. Its release pipeline selects an Arkari compiler, applies its enabled passes, strips metadata, renames eligible library files and ELF Rust dynamic symbols, and packs the runtime bundle using a modified UPX fork. Its default policy enables the implemented features; each is a separate source of friction, not an independent guarantee of protection.[^policy]

For a trusted Rust project, use:

```sh
cargo install cargo-rrea --locked
cargo rrea build --release
```

The tool requires native x86-64 Linux GNU or Windows MSVC, Rust/Cargo, Git, curl, CMake, Ninja, and a C++17 toolchain. It builds the bundled UPX fork during installation and acquires the compiler when needed. On Windows, the current documentation requires `cargo rrea build --release --no-mangle symbol`, because PE symbol renaming is not implemented. Linux application builds have runtime coverage; the complete Windows build pipeline remains unverified. Cross-compilation is not supported.[^policy]

The output executables are under `target/release/`, with shared libraries in `target/release/libs/`. Distribute the complete `libs` directory with the executable, including `libs.manifest` on Windows. Reports and logs are under `rrea/dist-<id>/` in Cargo's target directory. System and arbitrary native shared libraries are not automatically bundled. Build scripts and procedural macros run during compilation, so this is not a sandbox for an untrusted project.[^policy]

The layers have practical consequences:

- **Stripping** removes selected debug and symbol information, but required dynamic interfaces and unwind information remain. `--no-strip` retains the project's settings instead.
- **Name changes** make some library and symbol identities less obvious. On ELF, the symbol policy assumes a closed bundle; use `--keep-symbol NAME` for externally consumed or dynamically looked-up Rust names. Native interfaces must continue to work.
- **Packing** makes the on-disk payload less directly readable. The default opaque mode is reversible scrambling, not encryption. The matching modified packer can recover the original payload, and loader structure can still identify a packed binary. Packing can also increase size.
- **Runtime guard** in the Linux packer can terminate a program when an analysis-tool process name is visible, even if that tool is unrelated. This can affect legitimate users and debugging.
- **Compatibility and licensing** require review before distribution. The pipeline uses `panic = "unwind"`, changes linkage and release settings, and may expose pass-specific bugs. My modified UPX and stubs have GPL-compatibility restrictions; check the actual license and your distribution obligations.[^policy]

If a layer breaks a project, the CLI offers targeted opt-outs such as `--no-fla` and `--no-upx`. Disabling a layer changes the resulting protection. Test the complete bundle on each supported platform, including external symbol lookup, errors, and the actual deployment environment.

## What the measurements show

My [native evaluation][evaluation] tested one Linux x86-64 Base116 command-line application with a baseline, stripped and packed baselines, and protected bundle variants. The snapshot predates default ELF symbol renaming. It checked 52 binary/wrapper cases and 20 malformed-input cases per variant, not every possible application behavior.

On that workload, the baseline encoder had a 21.73 ms median and the protected, filename-mangled bundle had a 1,083.80 ms median. The corresponding decoder medians were 28.05 ms and 2,232.48 ms. The baseline was one 1,153,088-byte file; the protected bundle was 19 files totaling 5,968,316 bytes. These are measurements for one application and host, not general overhead estimates. The baseline used ordinary Rust linkage while the protected bundle used different linkage, so the difference cannot be attributed to LLVM passes alone.

The same evaluation recovered every protected artifact byte-for-byte with the matching packer. In that older snapshot, exported Rust symbols still identified Base116 routines despite renamed library files. Ghidra imported all tested files, but imports of packed files primarily analyzed the visible loader. Import counts and timeouts are not a measure of whether an analyst recovered the algorithm. The study did not perform a blinded, matched reconstruction test, so it does not establish a protection score or a reverse-engineering slowdown.

## Choose the boundary, then measure it

Do not embed a secret in a client and assume an obfuscator can keep it secret. Put authorization decisions and long-lived secrets on a server you control when the product permits it. Minimize what the client receives, validate requests on the server, and use standard cryptography for data protection. A local check can improve user experience, but an attacker who controls the executable can alter that check.

For code that must run locally, define the specific behavior or asset worth protecting. Build an ordinary release and a protected release from the same revision. Verify equivalent behavior, distribution contents, startup, memory, and representative workloads. Then give independent analysts the same task, tools, time budget, and prior information for both builds. Record correctness and time, not just whether a decompiler imports a file. Recheck after toolchain or dependency changes.

My Arkari-based toolchain and cargo-rrea can add obstacles to static analysis. My evaluation also shows recoverable artifacts and potentially substantial costs. Use them as one layer in a threat model, not as a substitute for one.

[^policy]: The [cargo-rrea architecture and feature contract][architecture] describes the switches, output layout, runtime behavior, and compatibility boundaries. Tool behavior can change between releases; check the documentation for the version you deploy.

[rea]: https://github.com/morluto/rea
[sublime]: https://gist.github.com/ParkSnoopy/fb46d844323165998d7ddb930aaf544e
[arkari]: https://github.com/ParkSnoopy/rust_llvm-arkari_ollvm
[rrea]: https://github.com/ParkSnoopy/cargo-rrea
[evaluation]: https://github.com/ParkSnoopy/cargo-rrea/blob/main/docs/evaluation.md
[architecture]: https://github.com/ParkSnoopy/cargo-rrea/blob/main/docs/architecture.md
