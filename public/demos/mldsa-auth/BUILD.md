# mldsa-auth live demo: how it is built

This folder is the live demo on the mldsa-auth project page. It runs the repo's
own C11 handshake and record layer, compiled to WebAssembly, in a Web Worker:
Device A (initiator) and Server B (responder) both live in the visitor's tab.

## What is what

| File | Where it comes from |
|---|---|
| `index.html`, `app.js`, `worker.js` | Written for this page. The UI and the worker messaging only; no cryptography. |
| `src/handshake_demo.c` | The demo shim, about 600 lines of C written for this page (GPL-3.0). It sets up the three ML-DSA-65 identities and the keystores that pin them, calls the repo's `handshake_*` and `session_*` functions, applies the "break it" modes (flip a bit on the wire, pin a different key, leave a pin out, deliver a forged ClientAuth, tamper with, replay or drop a record), times each call with `emscripten_get_now()`, and writes a JSON summary. Every check and refusal the page shows is the library's own return value. |
| `src/tests_entry.c` | A one-function `run_suite()` so two of the repo's test files fit in one module. |
| `src/build.sh` | The link step, below. |
| `hd.mjs`, `hd.wasm` | Generated: the shim linked with `libmldsa_core.a`, liboqs and libsodium. |
| `tests.mjs`, `tests.wasm` | Generated: the repo's `tests/test_handshake.c` and `tests/test_session.c`, compiled unchanged (only `-Dmain=...` so both fit), with the same libraries plus `liboqs-internal.a`. Fetched only when the visitor presses a Tests button. |

Source repo: https://github.com/happyc0der/mldsa-auth at commit
`7cb873100a4a165552e485018a4055cca789df48` (main, 2026-10-23).

## Toolchain used

- Emscripten 6.0.9 (`emcc 6.0.9-git`, Homebrew). The repo's CMake refuses any other
  version, and `src/build.sh` checks it too.
- CMake 4.4.3, and Node 26.8.2 (the one emcmake picked to run `ctest`), on macOS on Apple silicon.

## Commands

Use a scratch directory whose path has no spaces: libsodium's libtool breaks on
them (the repo's `cmake/Dependencies.cmake` explains why). `TMPDIR` decides where
the repo's CMake builds libsodium, so point it into the same scratch directory.

```sh
SCRATCH=/tmp/mldsa-demo                      # any path without spaces
DEMO=<portfolio checkout>/public/demos/mldsa-auth

git clone https://github.com/happyc0der/mldsa-auth "$SCRATCH/mldsa-auth"
git -C "$SCRATCH/mldsa-auth" checkout 7cb873100a4a165552e485018a4055cca789df48
mkdir -p "$SCRATCH/tmp"

# 1. The repo's own WebAssembly build (it fetches liboqs 0.16.0 at its pinned
#    commit and libsodium 1.0.22 by SHA-256, and builds both with emcc).
cd "$SCRATCH/mldsa-auth"
TMPDIR="$SCRATCH/tmp" emcmake cmake -S . -B build-wasm -DCMAKE_BUILD_TYPE=Release
TMPDIR="$SCRATCH/tmp" cmake --build build-wasm -j8
ctest --test-dir build-wasm                  # 3/3 passed: test_vectors, test_client_core_kat, wasm_module_gates

# 2. Link the two demo modules into this folder.
SODIUM=$(ls -d "$SCRATCH"/tmp/mldsa-auth-libsodium-1.0.22-*-install)
"$DEMO/src/build.sh" "$SCRATCH/mldsa-auth" "$SCRATCH/mldsa-auth/build-wasm" "$SODIUM" "$DEMO"
```

`src/build.sh` runs `emcc -O3` with `-sMODULARIZE=1 -sEXPORT_ES6=1
-sENVIRONMENT=worker -sFILESYSTEM=0 -sDYNAMIC_EXECUTION=0 -sSTACK_SIZE=8MB
-sALLOW_MEMORY_GROWTH=1`, the same stack and memory settings the repo's own wasm
build uses. `EMCC_ENV=node src/build.sh ...` builds a copy that plain Node can
import, for a quick check outside the browser.

## Output of the build that is committed here

| File | Bytes | SHA-256 |
|---|---|---|
| `hd.wasm` | 170,519 | `507f17e57cfcc8826d4536fa889cb9b138655e8afea0ca92b07be82915bcbbfa` |
| `hd.mjs` | 10,673 | `11d83768aaed1b0d8532364ad7a63e924b1cc51f0098d956ba2fb9c9d69a097d` |
| `tests.wasm` | 297,598 | `4c9571f22d2a5a36af0df317b542d08dc0e6796878f8bd20efa5f285c063f33c` |
| `tests.mjs` | 10,197 | `39a63ed981f335e39f37055c18e34e61180c13a98c785c50612a93bcb1c1260b` |

Linking a second time from the same build tree gave the same four hashes. A
fresh clone and build on another machine has not been compared.

## What the page measures, and what it does not

- Every timing on the page is measured in the visitor's browser, inside the
  worker, with `performance.now()`. Pages that are not cross-origin isolated get
  a coarse timer (0.1 ms in Chromium), so the page measures the step size and
  shows it next to single-call timings; the Bench tab times 100 handshakes and
  64 KiB records in batches.
- The README's numbers (0.45 ms median handshake, 736 MiB/s sealing) are native
  measurements on an Apple M4 Pro with liboqs's NEON code. The wasm build uses
  liboqs's portable C with no SIMD, so the page shows the README figures as a
  labelled reference, never as a ratio.
- The daemon (`mldsa-authd`, SQLite, sockets) does not run here. The repo's
  browser client (`web/mldsa_client`) needs that daemon, so this demo uses the
  core library directly instead.

## Licence

mldsa-auth is GPL-3.0; liboqs (MIT) and libsodium (ISC) are linked into the same
`.wasm` files, so the combined modules are covered by the GPL. The complete
corresponding source is the mldsa-auth commit above (which pins and fetches both
dependencies) plus `src/` in this folder.
