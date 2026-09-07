#!/usr/bin/env bash
# install.sh 가 source 하는 공통 함수. 단독 실행하지 않는다.

# ---- 검증된 조합 (공유 개발 서버 2026-09-03 실측) ----
# shellcheck disable=SC2034  # system.sh · asterisk.sh 가 쓴다
VERIFIED_OS_ID="ubuntu"
VERIFIED_OS_VERSION="22.04"
VERIFIED_ASTERISK_VERSION="18.10.0"

DRY_RUN="${DRY_RUN:-false}"
SUMMARY_LINES=()

c_bold=$'\e[1m'; c_dim=$'\e[2m'; c_red=$'\e[31m'; c_yel=$'\e[33m'; c_grn=$'\e[32m'; c_off=$'\e[0m'
if [[ ! -t 1 ]]; then c_bold=""; c_dim=""; c_red=""; c_yel=""; c_grn=""; c_off=""; fi

log()  { printf '%s>>>%s %s\n' "$c_bold" "$c_off" "$*"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '    %s✓%s %s\n' "$c_grn" "$c_off" "$*"; }
warn() { printf '    %s!%s %s\n' "$c_yel" "$c_off" "$*" >&2; }
die()  { printf '%s✗ %s%s\n' "$c_red" "$*" "$c_off" >&2; exit 1; }

# 상태를 바꾸는 명령은 전부 이것으로 감싼다. --dry-run 이면 찍기만 한다.
run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '    %s[dry-run]%s' "$c_dim" "$c_off"
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

# 파일을 통째로 쓴다. 내용은 stdin. dry-run 이면 대상만 찍는다.
write_file() {
  local path="$1" mode="${2:-0644}" owner="${3:-}"
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '    %s[dry-run]%s write %s (mode %s%s)\n' "$c_dim" "$c_off" "$path" "$mode" "${owner:+, owner $owner}"
    cat >/dev/null
    return 0
  fi
  install -d -m 0755 "$(dirname "$path")"
  cat >"$path.tmp"
  chmod "$mode" "$path.tmp"
  [[ -n "$owner" ]] && chown "$owner" "$path.tmp"
  mv "$path.tmp" "$path"
}

# KEY=value 파일에서 한 키를 바꾸거나 없으면 끝에 붙인다. 값에 든 / & 는 sed 이스케이프한다.
ensure_kv() {
  local file="$1" key="$2" value="$3"
  if [[ "$DRY_RUN" == "true" && ! -f "$file" ]]; then
    printf '    %s[dry-run]%s %s: %s=%s\n' "$c_dim" "$c_off" "$file" "$key" "$(mask_if_secret "$key" "$value")"
    return 0
  fi
  local escaped
  escaped="$(printf '%s' "$value" | sed -e 's/[\/&]/\\&/g')"
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    run sed -i -E "s/^${key}=.*/${key}=${escaped}/" "$file"
  else
    if [[ "$DRY_RUN" == "true" ]]; then
      printf '    %s[dry-run]%s append %s=%s to %s\n' "$c_dim" "$c_off" "$key" "$(mask_if_secret "$key" "$value")" "$file"
    else
      printf '%s=%s\n' "$key" "$value" >>"$file"
    fi
  fi
}

# 파일 안의 값을 읽는다 (마지막 정의가 이긴다). 따옴표는 벗긴다.
read_kv() {
  local file="$1" key="$2"
  { grep -E "^${key}=" "$file" 2>/dev/null || true; } | tail -n 1 | sed -E "s/^${key}=//; s/^\"(.*)\"$/\1/; s/^'(.*)'$/\1/"
  return 0
}

mask_if_secret() {
  local key="$1" value="$2"
  case "$key" in
    *SECRET*|*PASSWORD*|*_KEY) [[ -n "$value" ]] && printf '********' || printf '' ;;
    *) printf '%s' "$value" ;;
  esac
}

# 정확히 한 줄이 파일에 있게 한다 (없으면 붙인다).
ensure_line() {
  local file="$1" line="$2"
  if grep -qxF -- "$line" "$file" 2>/dev/null; then
    return 0
  fi
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '    %s[dry-run]%s append "%s" to %s\n' "$c_dim" "$c_off" "$line" "$file"
  else
    printf '%s\n' "$line" >>"$file"
  fi
}

rand_secret() { openssl rand -hex "${1:-32}"; }

# 비밀번호는 사람이 옮겨 적으므로 헷갈리는 글자를 뺀다.
rand_password() {
  tr -dc 'A-HJ-NP-Za-km-z2-9' </dev/urandom | head -c "${1:-16}"
  printf '!'
}

require_root() {
  [[ "$DRY_RUN" == "true" ]] && return 0
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || die "root 로 실행해야 합니다: sudo $0 ..."
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 && return 0
  [[ "$DRY_RUN" == "true" ]] && { warn "명령이 없습니다: $1 (dry-run 이라 계속)"; return 0; }
  die "필요한 명령이 없습니다: $1"
}

detect_public_ip() {
  { ip -4 route get 1.1.1.1 2>/dev/null || true; } | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}'
  return 0
}

# 검증된 조합인지. 아니면 ALLOW_UNVERIFIED 에 따라 멈추거나 경고한다.
check_verified() {
  local what="$1" actual="$2" expected="$3"
  if [[ "$actual" == "$expected"* ]]; then
    ok "$what: $actual (검증된 값)"
    return 0
  fi
  if [[ "${ALLOW_UNVERIFIED:-false}" == "true" ]]; then
    warn "$what 이(가) 검증된 값과 다릅니다: $actual (검증: $expected). ALLOW_UNVERIFIED=true 라 계속합니다."
    return 0
  fi
  die "$what 이(가) 검증된 값과 다릅니다: $actual (검증: $expected). 이 조합은 실 PBX 에서 확인된 적이 없습니다. 감수하려면 site.conf 에 ALLOW_UNVERIFIED=true"
}

summary_add() { SUMMARY_LINES+=("$*"); }

# 저장소 안의 파일을 읽을 때 쓰는 루트. site 단계가 INSTALL_ROOT 를 채운 뒤에는 그곳, 아니면 실행 중인 체크아웃.
repo_src() {
  if [[ -f "$INSTALL_ROOT/deploy/sites/_template/compose.prod.yml" ]]; then
    printf '%s' "$INSTALL_ROOT"
  else
    printf '%s' "$SCRIPT_ROOT"
  fi
}

# 사이트 디렉터리 경로들. site.conf 를 읽은 뒤에 쓴다.
site_dir()      { printf '%s/deploy/sites/%s' "$INSTALL_ROOT" "$SITE_CODE"; }
site_env()      { printf '%s/.env' "$(site_dir)"; }
site_compose()  { printf '%s/compose.prod.yml' "$(site_dir)"; }
compose_cmd()   { docker compose -f "$(site_compose)" --env-file "$(site_env)" "$@"; }

# site.conf 의 필수값과 형식을 검사한다.
validate_config() {
  local key
  for key in SITE_CODE TENANT_NAME SITE_DOMAIN ADMIN_DOMAIN API_DOMAIN ADMIN_LOGIN INSTALL_ROOT; do
    [[ -n "${!key:-}" ]] || die "site.conf 에 $key 가 비어 있습니다"
  done
  [[ "$SITE_CODE" =~ ^[a-z0-9][a-z0-9-]{1,30}$ ]] || die "SITE_CODE 는 소문자·숫자·하이픈 2~31자: $SITE_CODE"
  [[ "${SIP_PORT:-48950}" =~ ^[0-9]+$ ]] || die "SIP_PORT 가 숫자가 아닙니다: $SIP_PORT"
  [[ "${PUBLIC_SCHEME:-http}" =~ ^https?$ ]] || die "PUBLIC_SCHEME 은 http 또는 https"
  [[ "${FIREWALL:-ufw}" =~ ^(ufw|none)$ ]] || die "FIREWALL 은 ufw 또는 none"
  : "${HTTP_PORT:=80}" "${PUBLIC_SCHEME:=http}" "${ADMIN_EXTENSION:=2000}" "${SIP_PORT:=48950}"
  : "${RTP_PORT_RANGE:=10000:20000}" "${LOCAL_NETS:=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16}"
  : "${CID_LOGI_TCP_PORT:=28002}" "${CID_ICON_TCP_PORT:=28003}" "${CID_CALLMANOR_TCP_PORT:=28004}"
  : "${AGENT_DOWNLOADS:=true}" "${AGENT_DOWNLOADS_PORT:=5175}" "${BACKUP_CRON:=true}" "${FIREWALL:=ufw}"
  : "${SIP_SECURITY_PREPARE:=true}" "${ALLOW_UNVERIFIED:=false}" "${REPO_REF:=main}"
  if [[ -z "${PUBLIC_IP:-}" ]]; then
    PUBLIC_IP="$(detect_public_ip)"
    [[ -n "$PUBLIC_IP" ]] || die "PUBLIC_IP 를 자동 감지하지 못했습니다. site.conf 에 적어 주십시오"
    warn "PUBLIC_IP 를 비워 두어 $PUBLIC_IP 를 씁니다. NAT 뒤라면 공인 IP 를 직접 적어야 통화 음성이 됩니다"
  fi
}
