#!/usr/bin/env bash
# Links the two demo modules against an mldsa-auth wasm build tree.
#   src/build.sh <mldsa-auth checkout> <its build-wasm dir> <libsodium install prefix> <output dir>
# See ../BUILD.md for the full sequence, from clone to the files in this folder.
# EMCC_ENV=worker (the default) is what the page ships; EMCC_ENV=node gives a
# copy you can smoke-test with plain node.
# INCOMING_MODULE_JS_API names the Module options the worker passes in.
# Emscripten 6 no longer reads wasmBinary by default, and without it each
# instance would fetch its .wasm a second time after the worker's own download.
set -euo pipefail

REPO=$(cd "$1" && pwd)
BUILD=$(cd "$2" && pwd)
SODIUM=$(cd "$3" && pwd)
OUT=$(mkdir -p "$4" && cd "$4" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)

emcc --version | head -1 | grep -q ' 6\.0\.9' || { echo "need emcc 6.0.9 (the repo's pinned Emscripten)" >&2; exit 1; }

INC=(-I"$REPO/src/crypto" -I"$REPO/src/protocol" -I"$REPO/src/util"
     -I"$BUILD/_deps/liboqs-build/include" -I"$SODIUM/include")
LIBS=("$BUILD/src/libmldsa_core.a" "$BUILD/_deps/liboqs-build/lib/liboqs.a" "$SODIUM/lib/libsodium.a")
COMMON=(-O3 -std=c11 -Wall -Wextra
        -sMODULARIZE=1 -sEXPORT_ES6=1 "-sENVIRONMENT=${EMCC_ENV:-worker}"
        -sFILESYSTEM=0 -sDYNAMIC_EXECUTION=0
        -sSTACK_SIZE=8MB -sALLOW_MEMORY_GROWTH=1)

# 1. The interactive demo: both parties of the handshake and the record layer.
emcc "${COMMON[@]}" "${INC[@]}" "$HERE/handshake_demo.c" "${LIBS[@]}" \
  -sEXPORT_NAME=createHandshakeDemo -sINCOMING_MODULE_JS_API=wasmBinary \
  -sEXPORTED_FUNCTIONS=_hd_init,_hd_handshake,_hd_send,_hd_sessions,_hd_bench,_hd_record_bench,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPF64,UTF8ToString \
  -o "$OUT/hd.mjs"

# 2. The repo's own test suites, unchanged. test_handshake.c includes
#    <oqs/sha3.h>, which lives in liboqs-internal (as in tests/CMakeLists.txt).
emcc -O3 -std=c11 -Wall -Wextra "${INC[@]}" -c "$REPO/tests/test_handshake.c" \
  -Dmain=test_handshake_main -o "$OUT/.test_handshake.o"
emcc -O3 -std=c11 -Wall -Wextra "${INC[@]}" -c "$REPO/tests/test_session.c" \
  -Dmain=test_session_main -o "$OUT/.test_session.o"
emcc "${COMMON[@]}" "$HERE/tests_entry.c" "$OUT/.test_handshake.o" "$OUT/.test_session.o" \
  "$BUILD/src/libmldsa_core.a" "$BUILD/_deps/liboqs-build/lib/liboqs-internal.a" \
  "$BUILD/_deps/liboqs-build/lib/liboqs.a" "$SODIUM/lib/libsodium.a" \
  -sEXPORT_NAME=createRepoTests -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 \
  -sINCOMING_MODULE_JS_API=wasmBinary,print,printErr \
  -sEXPORTED_FUNCTIONS=_run_suite \
  -o "$OUT/tests.mjs"
rm -f "$OUT/.test_handshake.o" "$OUT/.test_session.o"

chmod 644 "$OUT"/hd.mjs "$OUT"/hd.wasm "$OUT"/tests.mjs "$OUT"/tests.wasm
ls -l "$OUT"/hd.mjs "$OUT"/hd.wasm "$OUT"/tests.mjs "$OUT"/tests.wasm
