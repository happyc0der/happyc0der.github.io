#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Rebuild the Atlas browser demo's atlas.mjs + atlas.wasm from fresh clones.
#
#   build.sh <atlas-engine checkout> <atlas-chess checkout> <output dir> [work dir]
#
# Needs Emscripten (em++ on PATH). Single-threaded on purpose: no -pthread, no WorkerPool.
set -euo pipefail

ATLAS=$(cd "$1" && pwd)
CHESS=$(cd "$2" && pwd)
OUT=$(mkdir -p "$3" && cd "$3" && pwd)
WORK=${4:-$(mktemp -d)}
mkdir -p "$WORK"
HERE=$(cd "$(dirname "$0")" && pwd)

COMMIT=$(git -C "$ATLAS" rev-parse --short=12 HEAD)
if [ -n "$(git -C "$ATLAS" status --porcelain --untracked-files=no)" ]; then DIRTY=true; SUFFIX=-dirty; else DIRTY=false; SUFFIX=; fi
VERSION=$(sed -n 's/^ *VERSION \([0-9.]*\)$/\1/p' "$ATLAS/CMakeLists.txt" | head -1)
CLANG=$(em++ --version | head -1 | sed 's/.* \([0-9][0-9.]*\).*/\1/')
# The commit date rather than the wall clock, so two builds of one commit are byte-identical.
STAMP=$(TZ=UTC git -C "$ATLAS" log -1 --date=format-local:%Y-%m-%dT%H:%M:%SZ --format=%cd)

# engine/core/CMakeLists.txt fills this template with configure_file(); this is the same
# substitution done by hand, for an Emscripten "Release" build.
sed -e "s|@PROJECT_VERSION@|$VERSION|g" \
    -e "s|@ATLAS_GIT_COMMIT@|$COMMIT|g" \
    -e "s|@ATLAS_GIT_DIRTY@|$DIRTY|g" \
    -e "s|@ATLAS_GIT_DIRTY_SUFFIX@|$SUFFIX|g" \
    -e "s|@CMAKE_CXX_COMPILER_ID@|Emscripten|g" \
    -e "s|@CMAKE_CXX_COMPILER_VERSION@|$CLANG|g" \
    -e "s|@CMAKE_BUILD_TYPE@|Release|g" \
    -e "s|@CMAKE_SYSTEM_NAME@|Emscripten|g" \
    -e "s|@CMAKE_SYSTEM_PROCESSOR@|wasm32|g" \
    -e "s|@ATLAS_CONFIGURE_TIMESTAMP@|$STAMP|g" \
    -e "s|@ATLAS_SANITIZE@||g" \
    "$ATLAS/engine/core/src/build_info.cpp.in" > "$WORK/build_info.cpp"

SOURCES=(
  "$ATLAS"/engine/core/src/{error,assert,log,args,hash}.cpp
  "$WORK/build_info.cpp"
  "$ATLAS"/engine/tasks/src/worker_pool.cpp
  "$ATLAS"/engine/simulation/src/{tick_accumulator,save_stream,command,command_codec,divergence,kernel,replay,save,schedule,turn_gate,world}.cpp
  "$ATLAS"/apps/lab/sim/src/{grid_layout,tables,generate,systems,commands,snapshot,mod_views}.cpp
  "$CHESS"/sim/src/{fen,mod_views,position,rules,tables,world}.cpp
  "$HERE/atlas_web.cpp"
)

# -ffp-contract=off is the engine's own rule (cmake/CompilerWarnings.cmake); wasm has no fused
# multiply-add to contract into, but the flag is kept so the build states the same policy.
# The prefix maps keep this machine's paths out of the binary (source_location strings), so the
# output depends on the sources and not on where they were checked out.
CXXFLAGS=(
  -std=c++23 -O3 -DNDEBUG -DATLAS_TRACY_ENABLED=0 -ffp-contract=off
  -ffile-prefix-map="$ATLAS"=atlas-engine -ffile-prefix-map="$CHESS"=atlas-chess
  -ffile-prefix-map="$HERE"=demo -ffile-prefix-map="$WORK"=generated
  -I"$ATLAS/engine/core/include" -I"$ATLAS/engine/tasks/include" -I"$ATLAS/engine/simulation/include"
  -I"$ATLAS/apps/lab/sim/include" -I"$CHESS/sim/include" -I"$ATLAS/engine/simulation/tests"
)

OBJS=()
n=0
for src in "${SOURCES[@]}"; do
  n=$((n + 1))
  obj="$WORK/$(printf %02d "$n")_$(basename "${src%.cpp}").o"
  em++ "${CXXFLAGS[@]}" -c "$src" -o "$obj"
  OBJS+=("$obj")
done

em++ -O3 "${OBJS[@]}" -o "$OUT/atlas.mjs" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,node -sALLOW_MEMORY_GROWTH=1 \
  -sINITIAL_MEMORY=64MB -sMAXIMUM_MEMORY=1GB -sSTACK_SIZE=1MB \
  -sFILESYSTEM=0 -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPU32,HEAP64,HEAPU64 \
  -sINCOMING_MODULE_JS_API=locateFile,print,printErr,instantiateWasm

echo "built $OUT/atlas.mjs and $OUT/atlas.wasm from atlas-engine $COMMIT$SUFFIX and atlas-chess $(git -C "$CHESS" rev-parse --short=12 HEAD)"
