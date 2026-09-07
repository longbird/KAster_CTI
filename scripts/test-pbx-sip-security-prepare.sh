#!/usr/bin/env bash
# Exercise file handling without touching /etc or reloading host services.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ $# -gt 0 ]]; then
  test_case="$1"
  set --
  # Load definitions only; do not run the root check or logger setup.
  source <(sed '/^require_root_for_apply$/,$d' scripts/pbx-sip-security-prepare.sh)
  REPO_DIR="$PWD"
  MODE=apply
  SIP_PORT=36070
  mktemp() {
    local created
    created="$(command mktemp "$@")"
    printf '%s\n' "$created" >> "$TEST_ROOT/created"
    printf '%s\n' "$created"
  }
  install() {
    [[ "${FAIL_INSTALL:-false}" != true ]] || return 42
    command cp "$3" "$TEST_ROOT/$(basename "$4")"
  }
  systemctl() { :; }
  fail2ban-client() { :; }
  if [[ "$test_case" == dry-run ]]; then
    MODE=dry-run
    # Dry-run must not render files or allocate temporary paths.
    sed() { echo 'Unexpected render during dry-run' >&2; return 90; }
    mktemp() { echo 'Unexpected temporary file during dry-run' >&2; return 91; }
  fi
  install_fail2ban
  exit
fi

TEST_ROOT="$(mktemp -d)"
export TEST_ROOT
trap 'rm -rf -- "$TEST_ROOT"' EXIT
mkdir "$TEST_ROOT/tmp"
export TMPDIR="$TEST_ROOT/tmp"

bash "$0" dry-run
[[ ! -e "$TEST_ROOT/created" ]]
echo 'PASS: dry-run does not render or create temporary files'

bash "$0" apply
grep -q '^port = 36070$' "$TEST_ROOT/kaster-pbx-sip.conf"
grep -q 'port="36070"' "$TEST_ROOT/kaster-pbx-sip.conf"
bash "$0" apply
[[ "$(sort -u "$TEST_ROOT/created" | wc -l)" -eq 2 ]]
echo 'PASS: repeated apply uses unique files and renders both port fields'

if FAIL_INSTALL=true bash "$0" apply; then
  echo 'FAIL: install error was swallowed' >&2
  exit 1
else
  status=$?
  [[ "$status" -eq 42 ]]
fi
while IFS= read -r created; do
  [[ ! -e "$created" ]]
done < "$TEST_ROOT/created"
[[ -z "$(find "$TMPDIR" -mindepth 1 -print -quit)" ]]
echo 'PASS: temporary files are removed after success and failure'
