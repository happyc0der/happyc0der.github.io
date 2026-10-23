# Atlas browser demo: how it is built

What runs here is Atlas's own C++23 code. The deterministic kernel, the lab world and the chess rules are compiled with Emscripten to one WebAssembly module and run single-threaded. The page around it (drawing, input, and a JavaScript stand-in for the engine's WAMR mod host) is this demo's own code.

## Sources

| Repository | Commit | Used for |
|---|---|---|
| [happyc0der/atlas-engine](https://github.com/happyc0der/atlas-engine) | `0232309e5b92174992e33b898d0409fccab1aba6` (main, M32) | `engine/core/src`, `engine/tasks/src`, `engine/simulation/src`, `apps/lab/sim/src`, plus the header-only test helpers in `engine/simulation/tests/synthetic_*.hpp` |
| [happyc0der/atlas-chess](https://github.com/happyc0der/atlas-chess) | `3a543e0133256d66342e05e903270242e31f5669` (main) | `sim/src`, and the committed `assets/mods/chess_opponent.wasm` (sha256 `b856ce40f227f2c5affa49c6bc2ddf47b3bd5901cf65e0d604badd8bd6505830`, the value in `assets/mods/chess_manifest.json`) |

`atlas-chess/atlas.ref` pins the engine at `d676577bf14e`. Between that commit and `0232309`, no file in `engine/core`, `engine/tasks`, `engine/simulation`, `engine/script` or `apps/lab/sim` changed except `engine/core/tests/test_build_info.cpp`, which is not compiled here. So the chess rules are built against the same engine code they pin. You can check this with `git -C atlas diff --stat d676577bf14e 0232309 -- engine/core engine/tasks engine/simulation engine/script apps/lab/sim`.

No submodules, vcpkg packages, SDL, ENet or WAMR are needed. The compiled modules link only the C++ standard library.

## Files

- `atlas.wasm`, `atlas.mjs`: the engine build, produced by `build/build.sh`.
- `build/atlas_web.cpp`: the demo's entry points into the engine. It runs the three golden scenarios exactly as their tests do, drives the lab, lockstep and chess views through the engine's `Kernel`, and provides the simulation side of the mod host (command types, submit, the seeded random streams and the views, mirroring `engine/script/src/mod_host.cpp`). The lab's map palettes are ported here from `apps/lab/view/src/cell_field.cpp`, because the view library links SDL_GPU and cannot be compiled for the browser. Its benchmark and perft entry points time batches rather than single runs; see "Timing in the browser" below.
- `chess_opponent.wasm`: copied byte for byte from atlas-chess.
- `modhost.js`: the JavaScript stand-in for WAMR. It enforces the import list, the required exports, the per-tick log budget and the call context. It does not enforce WAMR's per-tick instruction budget (10,000,000) or its own memory and stack ceilings.
- `app.js`, `index.html`: the page.
- `build/check-goldens.mjs`, `build/check-mod.mjs`: Node checks for a fresh build.

## Rebuild

You need Emscripten 6.0.9 (this build used Homebrew's `emscripten` 6.0.9), git and Node 24. Run this from the portfolio repository root:

```sh
work=$(mktemp -d)
git clone https://github.com/happyc0der/atlas-engine.git "$work/atlas"
git -C "$work/atlas" checkout 0232309e5b92174992e33b898d0409fccab1aba6
git clone https://github.com/happyc0der/atlas-chess.git "$work/atlas-chess"
git -C "$work/atlas-chess" checkout 3a543e0133256d66342e05e903270242e31f5669

public/demos/atlas-engine/build/build.sh "$work/atlas" "$work/atlas-chess" public/demos/atlas-engine "$work/obj"
cp "$work/atlas-chess/assets/mods/chess_opponent.wasm" public/demos/atlas-engine/
shasum -a 256 public/demos/atlas-engine/chess_opponent.wasm     # b856ce40…6505830

node public/demos/atlas-engine/build/check-goldens.mjs public/demos/atlas-engine
node public/demos/atlas-engine/build/check-mod.mjs public/demos/atlas-engine
```

`build.sh` fills `engine/core/src/build_info.cpp.in` the way `engine/core/CMakeLists.txt` does, with the clone's own commit, its dirty flag and its commit date. It compiles every source with `em++ -std=c++23 -O3 -DNDEBUG -DATLAS_TRACY_ENABLED=0 -ffp-contract=off`, and uses `-ffile-prefix-map` to keep local paths out of the binary. It then links with `-sMODULARIZE -sEXPORT_ES6 -sALLOW_MEMORY_GROWTH -sFILESYSTEM=0` and no `-pthread`. The output depends only on the sources and the toolchain: two builds from checkouts at different paths gave the same `atlas.wasm` (423,218 bytes, sha256 `6e4aba43616e7cec7487471416bd03c6948d3fa1614409c8d3802d4c7b954e68`).

## What the checks said for this build (2026-10-23)

`check-goldens.mjs`: all eight recorded hashes match on wasm32, and so does the Opera Game's final FEN with white mating.

```
match    engine final_state           got 0xAA82430DE2321AFF want 0xAA82430DE2321AFF
match    engine all_ticks             got 0x2603546C5687E95E want 0x2603546C5687E95E
match    lab initial                  got 0x9CF39EF66B2C4845 want 0x9CF39EF66B2C4845
match    lab final_state              got 0x1514CC4B3F41D18E want 0x1514CC4B3F41D18E
match    lab all_ticks                got 0xA962B352A643ABC9 want 0xA962B352A643ABC9
match    opera initial                got 0x7CF308582112403C want 0x7CF308582112403C
match    opera final_state            got 0xBAEC29542FFBAA76 want 0xBAEC29542FFBAA76
match    opera all_ticks              got 0x8862D6E8EEB7FC02 want 0x8862D6E8EEB7FC02
match    opera final FEN, white mates   1n1Rkb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2K5 b k - 1 17
```

`check-mod.mjs` replays the native run recorded in atlas-engine `docs/reports/M26.md` (`atlas_chess --headless --mod chess_opponent.wasm --moves e2e4,d1h5,f1c4,h5f7`) through the stand-in. As recorded, ply 8 is the mod's `e8f7` and the mod submitted 4 moves. M26 records only that last ply, so the mod's earlier replies (`e7e5`, `f8c5`, `d7d5`) are not checked against a native run.

The page shows the same golden comparison live. If a hash ever differs, the Hashes tab marks it `MISMATCH` in red and the summary counts it.

## Timing in the browser

The wasm reads the clock through `emscripten_get_now()`, which is `performance.now()`. GitHub Pages cannot send the cross-origin-isolation headers, so browsers round that clock: Chromium and Edge to 100 µs steps, others to as much as 1 ms. A whole tick of the 100² world (16 µs natively) is shorter than one step, so timing ticks one at a time, as `bench_simulation.cpp` does natively, would print the clock's step instead of the tick.

So the page measures the clock's step when it starts and works within it:

- **Benchmark** (`lab_bench`) builds the `bench_simulation.cpp` tick scenario (a fresh world, seed 11, two warm-up ticks) and times ticks in batches, one pair of clock reads per batch. The batch length doubles until one batch lasts at least 100 clock steps (20 ms on a 100 µs clock, 100 ms on a 1 ms clock), and then seven batches of that length are timed. It reports the median of the batch means. The native baseline is the median of single ticks, so the page states both methods next to each other.
- **Perft** (`chess_perft`) repeats the count, doubling the runs until a batch lasts as long, and divides by the runs. It adds up every run's node count and checks the total.
- **The live tick readout** times each tick on its own. It prints a figure only when the median tick lasts at least 20 clock steps. Below that it says the tick is too short for the clock and points to Benchmark, and the sparkline is not drawn.
- **One-off times** (the golden scenarios, world generation) are printed with a ±2-step error, or as "under" two steps.

Under Node's fine clock, the batched benchmark agreed with the single-tick median of the previous build to within 3%: 25.5 against 26.2 µs at 100², 252 against 245 µs at 320², and 2.51 against 2.45 ms at 1024².

## Measured in headless Edge on an Apple M4 Pro (2026-10-23)

These are not recorded native numbers. The clock counted in 100 µs steps with no cross-origin isolation.

- Benchmark, one thread, median of seven batch means: 100² 23.7–24.4 µs a tick (batches of 1,024 ticks), 320² 236–243 µs (128 ticks), 1024² 2.35–2.53 ms (8 or 16 ticks), across five runs. The recorded native figures for the same scenario are 16.1 µs, 161 µs and 1.675 ms (`benchmarks/baselines/mac16-7-appleclang-relwithdebinfo.json`). The M8 table in `docs/PERFORMANCE.md` is a separate native run of the million-cell tick: 1.650 ms with no pool, 694 µs on 4 workers.
- The same runs with `performance.now()` floored to whole milliseconds, which stands in for a 1 ms browser clock, gave 24.0 µs, 236 µs and 2.39 ms.
- Perft from the start position: depth 3 (8,902 nodes) in 221–230 µs a run, the mean of 128 or 512 runs. Depth 5 (4,865,609 nodes) took 124–129 ms in one run. Natively, depth 3 takes 172 µs (`docs/PERFORMANCE.md`, M22).

## Licence

Atlas and atlas-chess are GPL-3.0-or-later. `atlas.wasm` is built from them, and the glue in `build/` is under the same licence. The corresponding source is the two commits above plus `build/`.
