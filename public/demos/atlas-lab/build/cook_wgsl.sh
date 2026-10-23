#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Translate Atlas's shaders to WGSL for the browser build.
#
#   cook_wgsl.sh <atlas-engine checkout> <tint executable> [output dir, default ./shaders]
#
# The chain is Atlas's own first step and then Tint:
#   HLSL --glslang (exactly the command tools/cook_shaders.py runs)--> SPIR-V
#   SPIR-V --Tint (Dawn v20261022.205350)--> WGSL
#
# Not the Tint of v20260423.175430, the Dawn release Emscripten's emdawnwebgpu port is cut
# from: its SPIR-V reader drops the RowMajor decoration of a square matrix without the
# transpose that should replace it (lower/transpose_row_major.cc), so every Atlas vertex
# shader multiplied by the transposed view-projection and the map was drawn skewed. The
# October release emits `* transpose(view_projection)`. The check below fails the build if a
# row-major matrix ever reaches WGSL without one again.
#
# The SPIR-V glslang produces here is compared byte for byte with the SPIR-V the checkout
# commits in assets/cooked/shaders, so the WGSL is known to come from the shaders the native
# build runs. Tint then re-reads its own output, which is a full WGSL validation.
set -euo pipefail

ATLAS=$(cd "$1" && pwd)
TINT=$2
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${3:-$HERE/shaders}
mkdir -p "$OUT"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

GLSLANG=$(command -v glslangValidator || command -v glslang)
for src in "$ATLAS"/assets/source/shaders/*.hlsl; do
  name=$(basename "$src" .hlsl)              # e.g. cell.vert
  stage=${name##*.}                          # vert | frag
  glslang_out="$TMP/$name.spv"
  "$GLSLANG" -D -e main --target-env vulkan1.0 -S "$stage" -o "$glslang_out" "$src" > "$TMP/glslang.log" 2>&1 || { cat "$TMP/glslang.log" >&2; exit 1; }
  if ! cmp -s "$glslang_out" "$ATLAS/assets/cooked/shaders/$name.spv"; then
    echo "$name: glslang's SPIR-V differs from the committed $name.spv" >&2
    exit 1
  fi
  "$TINT" --format wgsl -o "$OUT/$name.wgsl" "$ATLAS/assets/cooked/shaders/$name.spv"
  "$TINT" --format wgsl -o /dev/null "$OUT/$name.wgsl"
  if spirv-dis "$ATLAS/assets/cooked/shaders/$name.spv" | grep -q " RowMajor" &&
     ! grep -q "transpose(" "$OUT/$name.wgsl"; then
    echo "$name: the SPIR-V has a row-major matrix and the WGSL no transpose; this Tint is too old" >&2
    exit 1
  fi
  echo "$name: HLSL -> SPIR-V (identical to the committed file) -> WGSL ($(wc -c < "$OUT/$name.wgsl" | tr -d ' ') bytes)"
done
echo "glslang: $("$GLSLANG" --version | head -1)"
