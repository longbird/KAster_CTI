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
PJ_RUNTIME_PATTERNS=(
  'pj*.so'
  'pj*.so.*'
  'pj*.dylib'
  'pjsip*.so'
  'pjsip*.so.*'
  'pjsip*.dylib'
  'pjsua*.so'
  'pjsua*.so.*'
  'pjsua*.dylib'
  'pjmedia*.so'
  'pjmedia*.so.*'
  'pjmedia*.dylib'
  'pjnath*.so'
  'pjnath*.so.*'
  'pjnath*.dylib'
  'pjlib-util*.so'
  'pjlib-util*.so.*'
  'pjlib-util*.dylib'
  'resample*.so'
  'resample*.so.*'
  'resample*.dylib'
)

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

search_roots=(
  "$(dirname "$BINARY_PATH")"
  "$BUILD_DIR"
)
if [[ -n "$BUILD_TYPE" && -d "$BUILD_DIR/$BUILD_TYPE" ]]; then
  search_roots+=("$BUILD_DIR/$BUILD_TYPE")
fi
if [[ -n "${PJSIP_ROOT:-}" ]]; then
  search_roots+=(
    "$PJSIP_ROOT"
    "$PJSIP_ROOT/bin"
    "$PJSIP_ROOT/bin64"
    "$PJSIP_ROOT/lib"
    "$PJSIP_ROOT/lib64"
    "$PJSIP_ROOT/Release"
    "$PJSIP_ROOT/Debug"
  )
fi

runtime_files=()
declare -a missing_dependencies=()
ldd_missing_regex='^[[:space:]]*(lib(pj|pjsip|pjsua|pjmedia|pjnath|pjlib-util|resample)[^[:space:]]*)[[:space:]]=>[[:space:]]not[[:space:]]found'
ldd_resolved_regex='^[[:space:]]*(lib(pj|pjsip|pjsua|pjmedia|pjnath|pjlib-util|resample)[^[:space:]]*)[[:space:]]=>[[:space:]]([^[:space:]]+)'

copy_runtime_file() {
  local source_path="$1"
  local target_name="${2:-$(basename "$source_path")}"
  cp -L "$source_path" "$DIST_DIR/$target_name"
  runtime_files+=("$target_name")
}

if [[ "$PLATFORM_NAME" == "macos" ]] && command -v otool >/dev/null 2>&1; then
  while IFS= read -r line; do
    dep_path="${line%% *}"
    dep_name="$(basename "${dep_path#@rpath/}")"
    case "$dep_name" in
      libpj*|libpjsip*|libpjsua*|libpjmedia*|libpjnath*|libpjlib-util*|libresample*)
        found=""
        for root in "${search_roots[@]}"; do
          found="$(find "$root" \( -type f -o -type l \) -name "$dep_name" -print -quit 2>/dev/null || true)"
          if [[ -n "$found" ]]; then
            copy_runtime_file "$found" "$dep_name"
            resolved_name="$(basename "$(realpath "$found")")"
            if [[ "$resolved_name" != "$dep_name" ]]; then
              copy_runtime_file "$found" "$resolved_name"
            fi
            break
          fi
        done
        if [[ -z "$found" ]]; then
          missing_dependencies+=("$dep_name")
        fi
        ;;
    esac
  done < <(otool -L "$BINARY_PATH" | tail -n +2)
elif command -v ldd >/dev/null 2>&1; then
  while IFS= read -r line; do
    if [[ "$line" =~ $ldd_missing_regex ]]; then
      missing_dependencies+=("${BASH_REMATCH[1]}")
    elif [[ "$line" =~ $ldd_resolved_regex ]]; then
      copy_runtime_file "${BASH_REMATCH[3]}" "${BASH_REMATCH[1]}"
      resolved_name="$(basename "${BASH_REMATCH[3]}")"
      if [[ "$resolved_name" != "${BASH_REMATCH[1]}" ]]; then
        copy_runtime_file "${BASH_REMATCH[3]}" "$resolved_name"
      fi
    fi
  done < <(ldd "$BINARY_PATH")
fi

if [[ ${#missing_dependencies[@]} -gt 0 ]]; then
  {
    echo "pbx-loadgen appears to depend on pjproject shared libraries, but one or more were not discoverable."
    echo "Search roots:"
    for root in "${search_roots[@]}"; do
      echo "  $root"
    done
    echo "Missing dependencies:"
    for dep in "${missing_dependencies[@]}"; do
      echo "  $dep"
    done
    echo "Point PJSIP_ROOT at a pjproject install or make the shared libraries visible next to the binary before packaging."
  } >&2
  exit 1
fi

if [[ ${#runtime_files[@]} -eq 0 ]]; then
  discovered=()
  for root in "${search_roots[@]}"; do
    for pattern in "${PJ_RUNTIME_PATTERNS[@]}"; do
      while IFS= read -r path; do
        [[ -n "$path" ]] && discovered+=("$path")
      done < <(find "$root" \( -type f -o -type l \) -name "$pattern" -print 2>/dev/null || true)
    done
  done
  if [[ ${#discovered[@]} -gt 0 ]]; then
    printf '%s\n' "${discovered[@]}" | sort -u | while IFS= read -r path; do
      [[ -n "$path" ]] && copy_runtime_file "$path"
    done
  else
    if [[ "${PBX_LOADGEN_ASSUME_STATIC_PJSIP:-0}" == "1" ]]; then
      echo "No pjproject shared libraries were discoverable; packaging continues because PBX_LOADGEN_ASSUME_STATIC_PJSIP=1." >&2
    else
      {
        echo "Unable to prove whether pbx-loadgen is statically linked to pjproject."
        echo "No pjproject shared libraries were discovered and ldd/otool did not yield copyable dependencies."
        echo "Point PJSIP_ROOT at a pjproject install or place the runtime libraries next to the binary before packaging."
        echo "If you know this build is fully static, rerun packaging with PBX_LOADGEN_ASSUME_STATIC_PJSIP=1."
      } >&2
      exit 1
    fi
  fi
fi
