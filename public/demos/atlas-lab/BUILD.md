# Atlas lab in the browser: how it is built

This page runs Atlas's own lab application, `apps/lab`, compiled with Emscripten. That includes its `main.cpp` with its frame loop, its cell renderer and identifier pass, its Dear ImGui overlay, and every engine module it links. The SDL_GPU backend of `engine/rhi` cannot run on the web, so a WebGPU backend written for this demo replaces it behind the same interface. The shaders are Atlas's own HLSL, translated to WGSL with glslang and Tint. The lab runs on one thread.

## Sources

| What | Version | Used for |
|---|---|---|
| [happyc0der/atlas-engine](https://github.com/happyc0der/atlas-engine) | `0232309e5b92174992e33b898d0409fccab1aba6` (main, M32) | `engine/`, `apps/common`, `apps/lab`, `assets/source/strings/en.json`, `assets/source/shaders/*.hlsl` and `assets/cooked/shaders/*.spv` |
| Emscripten | 6.0.9 (Homebrew) | the compiler, and its ports: **SDL 3.4.2** (`-sUSE_SDL=3`) and **emdawnwebgpu v20260423.175430** (`--use-port=emdawnwebgpu`) |
| Dear ImGui | `v1.92.8-docking`, commit `b61e563` | what Atlas's vcpkg manifest pins, plus its `backends/imgui_impl_wgpu.cpp` |
| EnTT, nlohmann/json, stb | `v3.16.0`, `v3.12.0`, `f75e8d1` (2024-07-29) | as Atlas pins them |
| ENet, WAMR | `v1.3.18`, `WAMR-2.4.5` | headers only (see "Null stand-ins" below) |
| glslang | 16.6.0 (Homebrew) | HLSL to SPIR-V, the command `tools/cook_shaders.py` runs |
| Tint, from [Dawn](https://dawn.googlesource.com/dawn) | `v20261022.205350`, commit `537308541a07` | SPIR-V to WGSL |

`build.sh` clones ImGui, EnTT, json, stb, ENet and WAMR at those commits itself.

Atlas pins SDL 3.4.12. The browser build uses the SDL 3.4.2 that Emscripten ships as a port, and the engine's platform module compiles against it unchanged.

## What changed for the web

Everything listed here is in `build/`, beside this file. That folder is the corresponding source that GPL-3.0 requires:

- [`build/build.sh`](build/build.sh), [`build/cook_wgsl.sh`](build/cook_wgsl.sh) and [`build/build-tint.sh`](build/build-tint.sh)
- [`build/atlas-web.patch`](build/atlas-web.patch)
- [`build/src/rhi/`](build/src/rhi/device.cpp): `device.cpp`, `resources.cpp`, `textures.cpp`, `device_impl.hpp`, `webgpu_conv.{hpp,cpp}`, `webgpu_access.cpp`, `backends.cpp` and `internal/include/atlas/rhi/internal/webgpu_access.hpp`
- [`build/src/null/null_enet.c`](build/src/null/null_enet.c) and [`build/src/null/null_wamr.c`](build/src/null/null_wamr.c)
- [`build/shaders/`](build/shaders/cell.vert.wgsl): the eight generated WGSL files

**1. A WebGPU backend for `engine/rhi`** (`build/src/rhi/`, 2,472 lines). It replaces the six SDL_GPU files (`device.cpp`, `resources.cpp`, `textures.cpp`, `sdl_gpu_conv.cpp`, `sdl_gpu_access.cpp` and `backends.cpp`, 2,110 lines). It implements the same `atlas/rhi/device.hpp`, and keeps the native files' own checks: sizes, stale handles, integer targets that refuse blending, vertex layouts, the readback limit and device-loss latching. `types.cpp` and `device_loss.cpp` are compiled unchanged. The backend has to differ from SDL_GPU where WebGPU works differently:

- **Uniforms.** SDL pushes uniform data into its command buffer. Here each push is copied into a per-frame arena in 256-byte slots, and the draw binds it with a dynamic offset. The arena reaches the GPU in one queue write just before the frame is submitted. A push larger than 256 bytes is refused; Atlas's largest is 96.
- **Register spaces become bind groups**, which is what the translated shaders expect: group 1 holds the vertex uniforms, group 2 the fragment textures and samplers, and group 3 the fragment uniforms.
- **Waiting.** SDL blocks on vsync and on fences, and a browser cannot block. So `begin_frame` yields to the browser until its next animation frame, which is where the browser presents the frame drawn before. `wait_idle`, device creation and shader and pipeline creation wait on WebGPU futures. All of these go through Emscripten's Asyncify. A shader or pipeline the browser refuses fails right there, with the browser's message, as it does natively.
- **Streaming and uploads.** `stream_buffer` and `upload_buffer` are queue writes. Their ordering against later submissions is what SDL's cycling and fences provide natively.
- **Readbacks.** A readback (the lab's picking) copies to a mappable buffer and is collected once the browser has mapped it, two frames later in the tests. Captures read the canvas texture directly.
- **Not supported.** Storage textures and buffers, more than one texture and sampler pair per draw, and immediate presentation. No Atlas shader uses the first two, and the lab samples no textures at all. The `debug` flag does nothing here, because the browser always validates.

**2. `atlas-web.patch`**, applied to five Atlas files. It adds 95 lines, each guarded by `__EMSCRIPTEN__`:

- `engine/rhi/include/atlas/rhi/device.hpp`: the internal accessors that the overlay uses are typed as WebGPU objects instead of SDL_GPU ones.
- `engine/rhi/include/atlas/rhi/types.hpp` and `src/types.cpp`: a `Backend::WebGpu` and a `ShaderFormat::Wgsl`, and the shipped shader formats become `{Wgsl}`.
- `engine/renderer/src/shader_loader.cpp`: it reads `name.stage.wgsl` beside each `.spv`.
- `engine/tools/src/debug_ui.cpp`: Dear ImGui's WebGPU renderer (`imgui_impl_wgpu`) replaces its SDL_GPU renderer. The overlay's panels, input handling and scaling are untouched.

`apps/lab/main.cpp` is not changed.

**3. Shaders** (`build/cook_wgsl.sh`, output in `build/shaders/`). glslang turns each HLSL file into SPIR-V with exactly the command Atlas's `tools/cook_shaders.py` runs. The script checks that output byte for byte against the SPIR-V Atlas commits, then Tint writes WGSL and reads it back to validate it. All eight shaders translate; the lab uses `cell` and `cell_id`.

**4. Null stand-ins** (`build/src/null/`):

- **ENet.** A page cannot open UDP sockets. `enet_initialize` fails, so `--listen` and `--connect` stop with Atlas's own "could not initialise the socket library". The in-process lockstep loopback (`--loopback-peers`) is real and runs.
- **WAMR.** Its interpreter calls host functions through a pointer of the wrong type, and WebAssembly traps on that, so it cannot run in a browser as Atlas configures it. Atlas's script module is compiled unchanged. `--mod` fails when the runtime refuses to start, and the lab runs without mods, as it does by default. The [Atlas engine demo](../atlas-engine/) runs a mod through a JavaScript stand-in.

**5. Running in a page.**

- **One thread.** The page passes `--workers 0`, because GitHub Pages cannot send the headers that SharedArrayBuffer needs.
- **The command line** is built from the page's options and handed to `main`: grid size, seed, `--commands-per-tick`, `--paused`, and `--save lab.save`. The save file lives in the module's in-memory filesystem, so F5, F9 and the panel's Save and Load buttons work until the page is reloaded.
- **Keys** reach the lab only while its canvas has focus (SDL's `SDL_EMSCRIPTEN_KEYBOARD_ELEMENT=#canvas`).
- **Touch.** Two-finger gestures are passed on as the right-drag and wheel events the lab reads from a mouse.
- **Exceptions.** C++ exceptions are compiled without support, Emscripten's default, so an exception would abort the module instead of reaching `guarded_main`'s handler. None was thrown in any test.
- **Escape** quits, as it does natively, and the page then offers to run the lab again.
- **Timing.** The lab's times come from `performance.now()`, which a page without cross-origin isolation gets rounded to 100 µs steps.

## The Tint version, and why it is not the one emdawnwebgpu comes from

The first build used Tint from Dawn `v20260423.175430`, the same Dawn release as Emscripten's emdawnwebgpu port. With it the map was drawn skewed.

Atlas's cbuffers are column-major in HLSL. glslang therefore emits them as `RowMajor` matrices with `OpVectorTimesMatrix`. That Tint's SPIR-V reader dropped the `RowMajor` decoration of a square matrix without adding the transpose that should replace it (`lang/spirv/reader/lower/transpose_row_major.cc`). Its WGSL multiplied by the transposed view-projection.

Dawn `v20261022.205350` emits `* transpose(view_projection)`, and the map is correct. `cook_wgsl.sh` now fails if a row-major matrix ever reaches WGSL without a transpose again.

## Rebuild

You need Emscripten 6.0.9, git, CMake, Ninja, rsync and glslang (`brew install emscripten cmake ninja glslang`), plus a network connection the first time. Run these from the portfolio repository root:

```sh
work=$(mktemp -d)
git clone https://github.com/happyc0der/atlas-engine.git "$work/atlas"
git -C "$work/atlas" checkout 0232309e5b92174992e33b898d0409fccab1aba6

# Tint, then the WGSL (optional: the WGSL is committed in build/shaders)
tint=$(public/demos/atlas-lab/build/build-tint.sh "$work/tint")
public/demos/atlas-lab/build/cook_wgsl.sh "$work/atlas" "$tint"

# the lab
public/demos/atlas-lab/build/build.sh "$work/atlas" public/demos/atlas-lab "$work/obj"
bytes=$(wc -c < public/demos/atlas-lab/atlas_lab.wasm | tr -d ' ')
sed -i '' "s/^const WASM_BYTES = [0-9]*;/const WASM_BYTES = $bytes;/" public/demos/atlas-lab/app.js
```

`build.sh` assembles the patched tree in the work directory and compiles 100 sources with `em++ -std=c++23 -O3 -DNDEBUG -DATLAS_TRACY_ENABLED=0 -ffp-contract=off`. Its ninja file recompiles only what changed. It then links with `-sASYNCIFY -sASYNCIFY_IGNORE_INDIRECT -sMODULARIZE -sEXPORT_ES6 -sALLOW_MEMORY_GROWTH -sEXIT_RUNTIME` and no `-pthread`, and embeds `en.json` and the WGSL at the paths the lab reads natively.

`-ffile-prefix-map` keeps local paths out of the binary. Two builds of the same commit, from clones at different paths, gave identical files:

| File | Bytes | gzip -9 | sha256 |
|---|---|---|---|
| `atlas_lab.wasm` | 2,300,875 | 860,699 | `1b8cb1cb145af06a6afa6c93541eff5955ab752a822a478298319fe82d660391` |
| `atlas_lab.mjs` | 239,187 | 56,633 | `e1fa35d105c70b6ee910cb317def458dda1171183a3966e802ebd66cf0a8edc0` |

Limiting Asyncify to direct calls (`ASYNCIFY_IGNORE_INDIRECT`) is safe because every wait above is reached from `main` through direct calls. It took the module from 3.10 MB to 2.30 MB, and the tick times below did not change.

## Checks, measured in headless Edge 155 on an Apple M4 Pro (2026-10-23)

**Hashes.** The page's "Check hashes against native" button runs the lab's own headless and loopback modes in fresh instances of the module. It compares their state hashes with a native `atlas_lab` built from the same commit (Debug, AppleClang 21, macOS arm64), run with the same arguments. All eight match:

| `atlas_lab` arguments | Native and browser |
|---|---|
| `--headless --unbounded --workers 0 --grid 256 --seed 1 --ticks 600` | initial `0x3ccd93216be5e73f`, tick 600 `0x790c3f6d07e1aa51` |
| `--headless --unbounded --workers 0 --grid 1024 --seed 1 --ticks 120` | initial `0x5edf8c8eaf0d3e21`, tick 120 `0xc8b13347307e4610` |
| `--headless --unbounded --workers 0 --grid 512 --seed 7 --ticks 300 --commands-per-tick 50` | initial `0x75cabf4ca183af27`, tick 300 `0xff02cf1bccee96a1` |
| `--loopback-peers 2 --grid 256 --ticks 200 --commands-per-tick 20` | both peers `0x095bc53ce4e86fc0` |

The native 1024² and 512² runs gave the same hashes with the default pool of 13 worker threads.

**Picking.** Every click in the tests was resolved by the GPU identifier pass, read back two to four frames later. Each one agreed with the projection's analytic inverse, which the lab checks and logs on every click.

**Browser timings.** These are not native numbers.

- Tick, one thread, from the lab's own tick-time counter in the headless runs above: 256² 0.15 ms, 512² with 50 commands a tick 0.57–0.58 ms, 1024² 2.27–2.29 ms. Atlas's recorded native figure for a 1024² tick with no pool is 1.675 ms (`benchmarks/baselines/mac16-7-appleclang-relwithdebinfo.json`; seed 11 in the benchmark, seed 1 here).
- Interactive at 1024², 21 seconds with no input, from the lab's frame counters at exit: 1,286 frames and 1,284 ticks, none dropped. The tick-time total was 3.85 s, 3.0 ms a tick. Frame time median 16.7 ms, p90 18.0 ms, p99 18.6 ms, max 18.8 ms, which is the display's 60 Hz. The overlay read 2.8 ms simulation, 2.1 ms snapshot, 0.5 ms draw and 11.3 ms acquire and present, the wait for the display.
- Interactive at 2048² (4.2 million cells), same run: 1,148 frames for 1,281 ticks, none dropped, 9.5 ms a tick. Frame time median 17.5 ms, p90 26.7 ms, p99 27.5 ms. The overlay read 9.6 ms simulation, 6.4 ms snapshot and 1.7 ms draw.

## Licence

Atlas is GPL-3.0-or-later. `atlas_lab.wasm` is built from it, from the third-party sources above under their own licences (zlib for SDL, MIT for Dear ImGui, EnTT, nlohmann/json and ENet, BSD-3-Clause for Dawn's emdawnwebgpu and Tint, public domain or MIT for stb, MIT or UIUC for Emscripten's runtime; WAMR's Apache-2.0 WITH LLVM-exception headers declare the functions `null_wamr.c` defines), and from `build/`. Everything in `build/` is under GPL-3.0-or-later.
