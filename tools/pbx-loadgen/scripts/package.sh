#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$TOOL_ROOT/native/build"
PLATFORM_NAME="linux"
case "$(uname -s)" in
  Darwin) PLATFORM_NAME="macos" ;;
esac
DIST_DIR="$TOOL_ROOT/dist/$PLATFORM_NAME"
BUILD_TYPE="${1:-}"

mkdir -p "$DIST_DIR"

candidate_paths=()
if [[ -n "$BUILD_TYPE" ]]; then
  candidate_paths+=("$BUILD_DIR/$BUILD_TYPE/pbx-loadgen")
fi
candidate_paths+=(
  "$BUILD_DIR/pbx-loadgen"
  "$BUILD_DIR/Release/pbx-loadgen"
  "$BUILD_DIR/Debug/pbx-loadgen"
  "$BUILD_DIR/RelWithDebInfo/pbx-loadgen"
  "$BUILD_DIR/MinSizeRel/pbx-loadgen"
)

BINARY_PATH=""
for candidate in "${candidate_paths[@]}"; do
  if [[ -x "$candidate" ]]; then
    BINARY_PATH="$candidate"
    break
  fi
done

if [[ -z "$BINARY_PATH" ]]; then
  echo "Unable to find pbx-loadgen under $BUILD_DIR" >&2
  exit 1
fi

cp "$BINARY_PATH" "$DIST_DIR/"
cp "$TOOL_ROOT/scenarios/"*.yaml "$DIST_DIR/"
