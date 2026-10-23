#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Build Atlas's lab application (apps/lab) for the browser.
#
#   build.sh <atlas-engine checkout> <output dir> [work dir]
#
# Needs Emscripten 6.0.9 (em++ on PATH), git, ninja and a network connection the first time
# (Emscripten fetches its SDL3 and emdawnwebgpu ports, and this script clones the other
# third-party sources at the versions Atlas's vcpkg manifest pins).
#
# What it does:
#   1. Copies engine/, apps/ and assets/ from the checkout into the work dir and applies
#      atlas-web.patch (WebGPU names in the RHI headers, a WGSL shader format, the overlay's
#      ImGui renderer). Every changed line is guarded by __EMSCRIPTEN__.
#   2. Compiles the lab and every engine module it links, unchanged apart from that patch,
#      plus this directory's src/: the WebGPU RHI backend that replaces engine/rhi's SDL_GPU
#      one, and null stand-ins for ENet and WAMR (see src/null/*.c for why).
#   3. Links with SDL3 and WebGPU from Emscripten's ports, single-threaded, with Asyncify so
#      that the lab's own frame loop can wait for the browser.
#
# The WGSL shaders in shaders/ are made by cook_wgsl.sh; this script only embeds them.
set -euo pipefail

ATLAS=$(cd "$1" && pwd)
OUT=$(mkdir -p "$2" && cd "$2" && pwd)
WORK=${3:-$(mktemp -d)}
WORK=$(mkdir -p "$WORK" && cd "$WORK" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
DEPS="$WORK/deps"
mkdir -p "$DEPS"

# ---- third-party sources, at the versions atlas-engine's vcpkg.json pins
fetch() {  # fetch <dir> <url> <commit>
  local dir="$DEPS/$1" url=$2 commit=$3
  if [ ! -d "$dir/.git" ]; then
    git init -q "$dir"
    git -C "$dir" fetch -q --depth 1 "$url" "$commit"
    git -C "$dir" checkout -q FETCH_HEAD
  fi
  local have
  have=$(git -C "$dir" rev-parse HEAD)
  [ "$have" = "$commit" ] || { echo "$1 is at $have, wanted $commit" >&2; exit 1; }
}
fetch imgui https://github.com/ocornut/imgui.git b61e56346a92cfcaf1f43a545ca37b0b32239654    # v1.92.8-docking
fetch entt https://github.com/skypjack/entt.git b4e58bdd364ad72246c123a0c28538eab3252672     # v3.16.0
fetch json https://github.com/nlohmann/json.git 55f93686c01528224f448c19128836e7df245f72     # v3.12.0
fetch stb https://github.com/nothings/stb.git f75e8d1cad7d90d72ef7a4661f1b994ef78b4e31       # 2024-07-29
fetch enet https://github.com/lsalzman/enet.git 2662c0de09e36f2a2030ccc2c528a3e4c9e8138a     # v1.3.18, headers only
fetch wamr https://github.com/bytecodealliance/wasm-micro-runtime.git 25bd7eb63e828e4bd242cc9b38d260b4b31c6605  # WAMR-2.4.5, headers only

# ---- the patched tree
# Assembled beside the last one and synchronised by content, so that a rebuild recompiles
# only the files whose bytes changed.
TREE="$WORK/atlas"
rm -rf "$WORK/atlas.new"
mkdir -p "$WORK/atlas.new" "$TREE"
cp -R "$ATLAS/engine" "$ATLAS/apps" "$ATLAS/assets" "$WORK/atlas.new/"
cp "$ATLAS/CMakeLists.txt" "$WORK/atlas.new/"
patch -s -p1 -d "$WORK/atlas.new" < "$HERE/atlas-web.patch"
rsync -r --checksum --delete "$WORK/atlas.new/" "$TREE/"
rm -rf "$WORK/atlas.new"

COMMIT=$(git -C "$ATLAS" rev-parse --short=12 HEAD)
if [ -n "$(git -C "$ATLAS" status --porcelain --untracked-files=no)" ]; then DIRTY=true; SUFFIX=-dirty; else DIRTY=false; SUFFIX=; fi
VERSION=$(sed -n 's/^ *VERSION \([0-9.]*\)$/\1/p' "$ATLAS/CMakeLists.txt" | head -1)
CLANG=$(em++ --version | head -1 | sed 's/.* \([0-9][0-9.]*\).*/\1/')
STAMP=$(TZ=UTC git -C "$ATLAS" log -1 --date=format-local:%Y-%m-%dT%H:%M:%SZ --format=%cd)
# What engine/core/CMakeLists.txt's configure_file() does, by hand, for an Emscripten build.
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
    "$TREE/engine/core/src/build_info.cpp.in" > "$WORK/build_info.cpp.new"
cmp -s "$WORK/build_info.cpp.new" "$WORK/build_info.cpp" 2>/dev/null || mv "$WORK/build_info.cpp.new" "$WORK/build_info.cpp"

E="$TREE/engine"
A="$TREE/apps"
W="$HERE/src"
SOURCES=(
  "$E"/core/src/{error,assert,log,args,hash}.cpp "$WORK/build_info.cpp"
  "$E"/tasks/src/worker_pool.cpp
  "$E"/simulation/src/{tick_accumulator,save_stream,command,command_codec,divergence,kernel,replay,save,schedule,turn_gate,world}.cpp
  "$E"/math/src/{matrix,camera}.cpp
  "$E"/platform/src/{platform,window,input,event,key,sdl_keymap,sdl_gamepadmap,gamepad,text_split,sdl_error,sdl_access}.cpp
  "$E"/rhi/src/{types,device_loss}.cpp
  "$W"/rhi/{device,resources,textures,webgpu_conv,webgpu_access,backends}.cpp
  "$E"/renderer/src/{quad_batch,texture_cache,shader_loader}.cpp
  "$E"/assets/src/{virtual_path,asset_id,importer,wav,audio_import,animation_clip,string_table,registry,artifact_cache,filesystem}.cpp
  "$E"/audio/src/{mix,synth,device}.cpp
  "$E"/text/src/{catalog,substitute}.cpp
  "$E"/edit/src/{command,history}.cpp
  "$E"/scene/src/{scene,serialization}.cpp
  "$E"/tools/src/{debug_ui,imgui_keymap,panels}.cpp
  "$E"/net/src/{enet_hub,inbox,link,loopback,session,message,protocol}.cpp
  "$E"/script/src/{runtime,mod,mod_host}.cpp
  "$A"/common/src/{log_options,frame_counters,ppm,run_bounds,camera_controller,socket_session,mods}.cpp
  "$A"/lab/sim/src/{grid_layout,tables,generate,systems,commands,snapshot,mod_views}.cpp
  "$A"/lab/view/src/{cell_field,cell_renderer,cell_id_pass}.cpp
  "$A"/lab/{main,file_bytes}.cpp
  "$DEPS"/imgui/{imgui,imgui_draw,imgui_tables,imgui_widgets}.cpp
  "$DEPS"/imgui/backends/imgui_impl_wgpu.cpp
  "$W"/null/{null_enet,null_wamr}.c
)

INCLUDES=()
for m in core tasks simulation math platform rhi renderer assets audio text edit scene tools net script; do
  INCLUDES+=(-I"$E/$m/include")
done
INCLUDES+=(
  -I"$W/rhi/internal/include" -I"$E/platform/internal/include" -I"$E/rhi/internal/include"
  -iquote "$E/rhi/src" -I"$TREE/assets/cooked/shaders"
  -I"$A/common/include" -I"$A/lab/sim/include" -I"$A/lab/view/include"
  -I"$DEPS/imgui" -I"$DEPS/imgui/backends" -I"$DEPS/entt/src" -I"$DEPS/json/include" -I"$DEPS/stb"
  -I"$DEPS/enet/include" -I"$DEPS/wamr/core/iwasm/include"
)
# The engine's own rules where they apply (cmake/CompilerWarnings.cmake: -ffp-contract=off),
# Tracy off as in a build without ATLAS_PROFILE, and the ports' headers.
COMMON=(-O3 -Wno-experimental -DNDEBUG -DATLAS_TRACY_ENABLED=0 -ffp-contract=off -sUSE_SDL=3 --use-port=emdawnwebgpu
  -DIMGUI_ENABLE_DOCKING=1
  -ffile-prefix-map="$TREE"=atlas-engine -ffile-prefix-map="$HERE"=demo -ffile-prefix-map="$WORK"=work)
CXXFLAGS=(-std=c++23 "${COMMON[@]}" "${INCLUDES[@]}")
CFLAGS=(-std=c17 "${COMMON[@]}" "${INCLUDES[@]}")

# ---- a ninja file, so a rebuild recompiles only what changed
NINJA="$WORK/build.ninja"
q() { printf '%q ' "$@"; }
OBJS=()
n=0
for src in "${SOURCES[@]}"; do
  n=$((n + 1))
  base=$(basename "$src"); base=${base%.*}
  OBJS+=("$WORK/obj/$(printf %03d "$n")_$base.o")
done
{
  echo "rule cxx"
  echo "  command = em++ $(q "${CXXFLAGS[@]}") -MD -MF \$out.d -c \$in -o \$out"
  echo "  depfile = \$out.d"
  echo "  deps = gcc"
  echo "  description = em++ \$in"
  echo "rule cc"
  echo "  command = emcc $(q "${CFLAGS[@]}") -MD -MF \$out.d -c \$in -o \$out"
  echo "  depfile = \$out.d"
  echo "  deps = gcc"
  echo "  description = emcc \$in"
  for i in "${!SOURCES[@]}"; do
    src=${SOURCES[$i]}
    case "$src" in *.c) rule=cc ;; *) rule=cxx ;; esac
    echo "build ${OBJS[$i]#"$WORK/"}: $rule $(printf '%s' "$src" | sed 's/[ :$]/$&/g')"
  done
} > "$NINJA.new"
cmp -s "$NINJA.new" "$NINJA" 2>/dev/null || mv "$NINJA.new" "$NINJA"
rm -f "$NINJA.new"
ninja -C "$WORK" -f build.ninja

# ---- link
# Asyncify: the lab's frame loop is Atlas's own `while (!quit)` in apps/lab/main.cpp, and the
# WebGPU backend waits for the browser inside it: begin_frame for the next animation frame,
# Device::create for the adapter and the device, create_shader and create_graphics_pipeline
# for their validation scopes, wait_idle for the queue. Every one of those is reached from
# main through direct calls only, so indirect calls are left uninstrumented
# (ASYNCIFY_IGNORE_INDIRECT): the kernel's systems, which it calls through std::function,
# then run as plain code. That took the module from 3.10 to 2.30 MB.
#
# Files: the lab reads its interface strings and its shaders from the paths it would use
# natively, relative to the working directory, so they are embedded at those paths.
em++ -O3 "${OBJS[@]}" -o "$OUT/atlas_lab.mjs" \
  -sUSE_SDL=3 --use-port=emdawnwebgpu -Wno-experimental \
  -sASYNCIFY=1 -sASYNCIFY_IGNORE_INDIRECT=1 -sASYNCIFY_STACK_SIZE=65536 \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createAtlasLab -sENVIRONMENT=web \
  -sINVOKE_RUN=0 -sEXIT_RUNTIME=1 -sEXPORTED_RUNTIME_METHODS=callMain,FS,ENV \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=128MB -sMAXIMUM_MEMORY=2GB -sSTACK_SIZE=2MB \
  -sINCOMING_MODULE_JS_API=arguments,locateFile,print,printErr,canvas,preRun,onExit,onAbort,setStatus,monitorRunDependencies,instantiateWasm \
  --embed-file "$TREE/assets/source/strings/en.json@/assets/source/strings/en.json" \
  --embed-file "$HERE/shaders@/assets/cooked/shaders"

echo "built $OUT/atlas_lab.mjs and atlas_lab.wasm from atlas-engine $COMMIT$SUFFIX"
