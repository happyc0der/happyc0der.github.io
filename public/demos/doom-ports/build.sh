#!/usr/bin/env bash
# Rebuilds doomce.js + doomce.wasm from src/ (see BUILD.md). Needs emcc on PATH.
set -euo pipefail
cd "$(dirname "$0")"

emcc -std=c11 -O2 -Wall -Wextra -Isrc/stub src/web.c -o doomce.js \
  -sASYNCIFY -sENVIRONMENT=web -sMODULARIZE -sEXPORT_ES6 -sEXPORT_NAME=createDoomCE \
  -sFILESYSTEM=0 -sINITIAL_MEMORY=16MB \
  -sEXPORTED_FUNCTIONS=_main,_set_keys,_set_cap,_set_paused,_request_reset \
  -sINCOMING_MODULE_JS_API=wasmBinary,print,printErr "$@"

ls -l doomce.js doomce.wasm
