#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NATIVE_DIR="$(cd "$SCRIPT_DIR/../native" && pwd)"
BUILD_DIR="$NATIVE_DIR/build"
BUILD_TYPE="${1:-Release}"

cmake_args=(-S "$NATIVE_DIR" -B "$BUILD_DIR" -DCMAKE_BUILD_TYPE="$BUILD_TYPE")
if [[ -n "${PJSIP_ROOT:-}" ]]; then
  cmake_args+=(-DPJSIP_ROOT="$PJSIP_ROOT")
fi

cmake "${cmake_args[@]}"
cmake --build "$BUILD_DIR" --config "$BUILD_TYPE"
