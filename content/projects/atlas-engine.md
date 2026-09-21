---
title: Atlas
blurb: C++23 engine for map-based grand strategy. Engine only, no game.
repo: https://github.com/happyc0der/atlas-engine
year: 2026
order: 2
featured: true
stack: [C++23, SDL_GPU, HLSL, WebAssembly, CMake, vcpkg, Catch2, Tracy]
tags: [swe]
stats: ["deterministic replay", "WASM mods", "4 CI workflows"]
bullets:
  - "C++23 engine for map-based strategy games: SDL_GPU renderer, asset pipeline with hot reload, versioned scene serialization."
  - "Deterministic fixed-tick simulation with state hashing, replay and lockstep; mods run sandboxed in WebAssembly."
  - "CI with sanitizers, lint and GPU smoke tests; benchmarks gated at 1.25x of a recorded baseline; 16 ADRs."
---

The simulation runs on a fixed tick and hashes its state, so a replay or a second machine in lockstep can be checked bit for bit. Mods are WebAssembly modules and cannot touch anything the engine does not hand them.

`atlas_lab` drives a synthetic million-cell grid for profiling. Design decisions are written down as ADRs. Not done yet: a real network transport, and GPU backends other than Metal are unverified.
