---
title: atlas-chess
blurb: Chess built against an installed copy of my Atlas engine and nothing else, the test of the engine's v1.0 charter, with a WebAssembly mod as the opponent.
repo: https://github.com/happyc0der/atlas-chess
year: 2026
order: 44
featured: false
credit: "Built on my own Atlas engine; its history before the move is in atlas-engine."
stack: [C++23, C, WebAssembly, CMake, vcpkg, Catch2, CTest, clang-tidy]
tags: [swe]
stats: ["every rule, draws included", "72 Catch2 test cases", "3 platforms' presets"]
bullets:
  - "Moved chess out of the Atlas engine's tree into its own repository, built against the engine's installed SDK and nothing else, as the test of Atlas's v1.0 charter: a game links the engine, loads data and runs a deterministic simulation without patching engine internals."
  - "Implements every rule, draws included (castling, en passant, promotion, stalemate, fifty-move rule, threefold repetition, insufficient material), with the move generator checked against published perft counts and the Opera Game's final position as a golden hash; the rules library may link only the engine's simulation layer, and the build checks it."
  - "Plays two people at one screen, two processes over a socket in lockstep, or against a sandboxed opponent written in freestanding C and compiled to WebAssembly that does a fixed amount of work per tick."
resume_bullets:
  - "Built chess against an installed copy of my Atlas engine, proving a game can ship without patching engine internals."
  - "Verified the move generator against published perft counts; the rules library may link only the engine's simulation layer."
  - "Wrote a sandboxed WebAssembly opponent in C and lockstep play over a socket."
---

Atlas's charter declares v1.0 when a game project links the engine, loads data and runs a deterministic simulation without patching engine internals. atlas-chess is that test. Chess was written inside the engine's tree from milestone 18 to 26 as a probe, and moved here in milestone 27 once the engine could be installed as a package; the first commit names the engine commit it came from, and `atlas.ref` pins the engine commit it builds against.

The rules library implements every rule, draws included: castling, en passant, promotion, check, checkmate, stalemate, the fifty-move rule, threefold repetition and insufficient material. The move generator is checked against the published perft counts, and the Opera Game's final position is a golden hash. The library may link only the engine's simulation layer, which the build enforces. The game runs as a board in a window for two people at one screen, as two processes over a socket in lockstep, or against an opponent that is a sandboxed mod: freestanding C compiled to WebAssembly, with its own rules and a two-ply search that does a fixed amount of work per tick.

There are 72 Catch2 test cases across the rules, positions, FEN, perft and board drawing, plus whole-program integration cases run by CTest, and clang-tidy runs over chess's own headers. Presets cover macOS, Linux with Clang and Windows with MSVC. What is deliberately not built yet, such as claimable draws, PGN, undo and a stronger search, is listed with the trigger that would justify it in DEFERRED.md. GPL-3.0-or-later.
