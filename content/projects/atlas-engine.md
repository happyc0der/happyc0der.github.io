---
title: Atlas
blurb: C++23 engine for map-based strategy games with a deterministic lockstep simulation and sandboxed WebAssembly mods.
repo: https://github.com/happyc0der/atlas-engine
image: /img/atlas-engine.png
year: 2026
order: 2
featured: true
status: in progress
stack: [C++23, SDL_GPU, HLSL, WebAssembly, ENet, CMake, vcpkg, Catch2]
tags: [swe]
stats: ["1045 tests", "1M-cell tick in 694 us", "25 milestones, 21 ADRs"]
bullets:
  - "Solo C++23 engine for map-based strategy games, built in 25 gated milestones: SDL_GPU renderer, asset pipeline with hot reload, versioned scene serialization, audio, animation, and 21 architecture decision records."
  - "Deterministic fixed-tick simulation with canonical state hashing, replay, save and load, and lockstep play over ENet sockets proved hash for hash between two processes; a million-cell tick runs in 694 us on four workers."
  - "Mods run as untrusted WebAssembly with no clock, filesystem or random generator; 1045 tests, and CI on macOS, Linux and Windows with ASan and TSan lanes, clang-tidy, a software-GPU lane and benchmarks gated at 1.25x of a recorded baseline."
resume_bullets:
  - "Solo C++23 engine for map-based strategy games, 25 gated milestones: SDL_GPU renderer, hot-reload assets, versioned serialization, 21 ADRs."
  - "Deterministic fixed-tick simulation with state hashing, replay and lockstep over ENet, proved hash for hash across two processes; million-cell tick in 694 us."
  - "Mods run as WebAssembly with no clock, filesystem or RNG; 1045 tests, CI on macOS, Linux and Windows with ASan/TSan and gated benchmarks."
---

Atlas is an engine, not a game: it has no countries, wars, diplomacy or rules, and is not meant to. I built it alone in gated milestones, M0 through M24, each ending with a clean configure, build, test run and a runnable demonstration. Every decision that is expensive to reverse is an ADR, 21 so far, and recent milestones each end with a report of what changed, what was run and what is still risky.

The simulation advances in whole integer ticks and hashes its state, so a replay, a save or a second machine in lockstep can be checked bit for bit. Lockstep runs over the command queue: M14 proved it with several simulations in one process agreeing hash for hash, M17 with two processes over a real ENet socket at a 22.4 us median round trip. A million-cell tick takes 694 us on four workers against 1.650 ms without the pool; what remains is serial, and the hash is 0.38 ms of it. Mods are WebAssembly modules that reach simulation state only by submitting commands, with no clock, no filesystem and no random generator of their own.

Three applications drive it. `atlas_sandbox` demonstrates the lifecycle and scene layer. `atlas_lab` is a synthetic million-cell grid with map modes, picking, time controls and replay, there to test the architecture rather than to be a game. `atlas_chess` is the first game on the engine: every rule including the draws, perft-verified, with the Opera Game as a golden hash, playable by two people at one screen or over a socket, and no line of it in `engine/`.

Not done: the renderer is verified on one Apple GPU and one software rasteriser, so Direct3D 12 and non-Apple hardware are untested. Networking is direct address only, with no encryption, NAT traversal or lobby. No large mod has been written, so what loading a real one costs is unmeasured. Everything deferred is listed with its reason in `docs/DEFERRED.md`.
