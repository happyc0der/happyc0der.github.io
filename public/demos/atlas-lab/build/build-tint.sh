#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Build Tint, Dawn's WGSL compiler, for cook_wgsl.sh.
#
#   build-tint.sh <work dir>        prints the path of the tint executable it built
#
# Only the command-line tool, with the SPIR-V reader and the WGSL reader and writer, and only
# the three submodules those need. Needs git, CMake, Ninja and a C++ compiler; about 700 MB of
# disk and a few minutes.
set -euo pipefail
WORK=$(mkdir -p "$1" && cd "$1" && pwd)
TAG=v20261022.205350   # commit 537308541a072a4b348a6bdd4d54e808f4239a7a
if [ ! -d "$WORK/dawn/.git" ]; then
  git clone -q --depth 1 --branch "$TAG" https://github.com/google/dawn.git "$WORK/dawn"
fi
git -C "$WORK/dawn" submodule update -q --init --depth 1 \
  third_party/abseil-cpp third_party/spirv-headers/src third_party/spirv-tools/src
cmake -S "$WORK/dawn" -B "$WORK/build" -G Ninja -DCMAKE_BUILD_TYPE=Release \
  -DDAWN_FETCH_DEPENDENCIES=OFF -DDAWN_BUILD_SAMPLES=OFF -DDAWN_BUILD_TESTS=OFF -DDAWN_BUILD_PROTOBUF=OFF \
  -DDAWN_ENABLE_METAL=OFF -DDAWN_ENABLE_VULKAN=OFF -DDAWN_ENABLE_NULL=OFF -DDAWN_ENABLE_DESKTOP_GL=OFF \
  -DDAWN_ENABLE_OPENGLES=OFF -DDAWN_USE_GLFW=OFF -DDAWN_ENABLE_SPIRV_VALIDATION=OFF \
  -DTINT_BUILD_CMD_TOOLS=ON -DTINT_BUILD_SPV_READER=ON -DTINT_BUILD_WGSL_READER=ON -DTINT_BUILD_WGSL_WRITER=ON \
  -DTINT_BUILD_GLSL_WRITER=OFF -DTINT_BUILD_GLSL_VALIDATOR=OFF -DTINT_BUILD_HLSL_WRITER=OFF \
  -DTINT_BUILD_MSL_WRITER=OFF -DTINT_BUILD_SPV_WRITER=OFF -DTINT_BUILD_NULL_WRITER=OFF \
  -DTINT_BUILD_IR_BINARY=OFF -DTINT_BUILD_TESTS=OFF -DTINT_BUILD_BENCHMARKS=OFF > "$WORK/configure.log"
ninja -C "$WORK/build" tint > "$WORK/build.log"
echo "$WORK/build/tint"
