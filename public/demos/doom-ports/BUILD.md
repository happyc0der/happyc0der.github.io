# DOOMCE live demo: how it is built

This page runs DOOMCE, the TI-84 Plus CE raycaster from
[happyc0der/doom-ports](https://github.com/happyc0der/doom-ports), in the browser.
It is the calculator program's own C file, compiled to WebAssembly with Emscripten
through a browser version of the repo's SDL2 host harness (`hosttest/play.c`).
It runs at the browser's speed under a frame cap; it is not an eZ80 emulator and
needs no calculator ROM. The Garmin watch port (Monkey C, `ciq/`) is not part of it.

Source commit: `ad5898f344a08be85f7efbc293d53f2c801cb9b0` (happyc0der/doom-ports, GPL-3.0-or-later).

## Files

| Path | What it is |
|---|---|
| `src/main.c` | `src/main.c` from the repo at ad5898f, unmodified (sha256 `8d79ba2506e735b35119650d2483c88eb1efdd7eb6e436fbf5b3e53bc90d99f8`) |
| `src/stub/graphx.h`, `keypadc.h`, `tice.h` | `hosttest/stub/*.h` from the repo at ad5898f, unmodified |
| `src/web.c` | The browser harness, written for this demo and modelled on `hosttest/play.c`. It defines the host buffers the stubs expect, `#define main ce_main`, includes `main.c`, and supplies `kb_Scan()` and `gfx_SwapDraw()` |
| `build.sh` | The emcc command |
| `doomce.js`, `doomce.wasm` | Build output (Emscripten ES module and WebAssembly) |
| `assets/poster.png` | `docs/corridor.png` from the repo at ad5898f: a frame drawn by the engine, shown before the visitor presses Start |
| `index.html` | The page: canvas, key and touch input, frame cap, notes |

How `web.c` differs from `play.c`:

- It adds a door key. `main.c` opens doors on `kb_Data[2] & kb_Alpha` (the calculator's ALPHA key), and
  `play.c` never sets that bit, so doors could not be opened there. Here E and the touch pad's Door button set it.
- Fire is Space only; `play.c` also used Left Ctrl, which in a browser collides with shortcuts such as Ctrl+W.
- `gfx_SwapDraw()` decodes the 1555 palette the same way, hands the frame to the page (`putImageData`), then
  waits with `emscripten_sleep()` until the next frame is due. That is what lets `ce_main()`, the calculator's
  blocking game loop, run unchanged under `-sASYNCIFY`. It sets `timer_1_Counter` from the browser clock at
  32768 Hz, so the fps number in the game's own status bar is measured.
- The loop sleeps while the page is hidden, the frame is scrolled out of view or the frame loses focus.
- R and the Restart buttons do what R does in `play.c`: health 100, ammo 50, kills 0, `init_world()`.
- No tuning keys (`[ ] - = , .`), no depth-buffer view (F1) and no quit key.

## Regenerate it

Needs git, `shasum` and Emscripten (built and checked with emcc 6.0.9 from Homebrew,
`brew install emscripten`). From the portfolio repo root:

```sh
git clone https://github.com/happyc0der/doom-ports /tmp/doom-ports-src
git -C /tmp/doom-ports-src checkout ad5898f344a08be85f7efbc293d53f2c801cb9b0

D=public/demos/doom-ports
cp /tmp/doom-ports-src/src/main.c "$D/src/main.c"
cp /tmp/doom-ports-src/hosttest/stub/graphx.h /tmp/doom-ports-src/hosttest/stub/keypadc.h \
   /tmp/doom-ports-src/hosttest/stub/tice.h "$D/src/stub/"
cp /tmp/doom-ports-src/docs/corridor.png "$D/assets/poster.png"
shasum -a 256 "$D/src/main.c"     # 8d79ba2506e735b35119650d2483c88eb1efdd7eb6e436fbf5b3e53bc90d99f8

"$D/build.sh"
```

`build.sh` runs:

```sh
emcc -std=c11 -O2 -Wall -Wextra -Isrc/stub src/web.c -o doomce.js \
  -sASYNCIFY -sENVIRONMENT=web -sMODULARIZE -sEXPORT_ES6 -sEXPORT_NAME=createDoomCE \
  -sFILESYSTEM=0 -sINITIAL_MEMORY=16MB \
  -sEXPORTED_FUNCTIONS=_main,_set_keys,_set_cap,_set_paused,_request_reset \
  -sINCOMING_MODULE_JS_API=wasmBinary,print,printErr
```

It compiles with no warnings. With emcc 6.0.9 the output is byte-identical from build to build:

```
8ee672b2d4696fb89e1c598a1a492d90ed02de36f1aafa63d745648613bd1e8e  doomce.js
d4a025211d0fe66fcd88c62ed465d3ae9813c7887595d38c4812d09b39b8f8cd  doomce.wasm
```

Extra arguments to `build.sh` are passed to emcc. For example, `./build.sh -sASSERTIONS=1` gives a debug build.

## Runtime

- No network beyond this folder and `../_shared/demo.css`. Nothing is downloaded until the visitor presses
  Start, and then only `doomce.js` (about 10 KB) and `doomce.wasm` (about 57 KB).
- `window.doomce` holds the current health, ammo, kills, position, angle, open-door count and fps, so the
  page can be checked by a script. Writing to it changes nothing in the game.

## Licence

DOOMCE is GPL-3.0-or-later (see the header of `src/main.c` and the repo's `LICENSE`). `src/web.c` is under the
same licence. The complete source of this build is in `src/` next to this file.
