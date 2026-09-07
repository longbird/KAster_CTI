#!/usr/bin/env bash
# KAster CTI 단일 서버 설치 스크립트 (PBX + CTI 컨테이너 + 첫 계정 + 방화벽 + 검증).
#
#   sudo install/install.sh --wizard                       # 답안 파일을 만들고 바로 설치
#   sudo install/install.sh --config install/site.conf     # 답안 파일로 설치 (다시 실행해도 안전)
#   sudo install/install.sh --config ... --bundle kaster-bundle-<site>.tgz   # 인터넷·Docker Hub 없는 서버
#   sudo install/install.sh --config ... --dry-run          # 무엇을 할지 보기만
#
# 단계: system → site → asterisk → firewall → deploy → verify
# 검증된 조합만 기본 허용한다: Ubuntu 22.04 + apt Asterisk 18.10 + Ubuntu docker.io (공유 개발 서버 2026-09-03 실측).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC2034  # lib/*.sh 가 쓴다
SCRIPT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ALL_PHASES=(system site asterisk firewall deploy verify)

# shellcheck disable=SC1091
. "$SCRIPT_DIR/lib/common.sh"
for f in system asterisk site deploy verify wizard; do
  # shellcheck disable=SC1090
  . "$SCRIPT_DIR/lib/$f.sh"
done

usage() {
  sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  cat <<'USAGE'

옵션:
  --config FILE      답안 파일 (기본 install/site.conf)
  --wizard           질문에 답해 답안 파일을 만든 뒤 설치
  --bundle FILE      install/make-offline-bundle.sh 가 만든 tgz (deb·이미지·저장소 포함)
  --only P[,P]       지정한 단계만
  --from P           그 단계부터 끝까지
  --skip P[,P]       지정한 단계 건너뜀
  --dry-run          바꾸는 명령을 실행하지 않고 찍는다
  -h, --help
USAGE
}

CONFIG="$SCRIPT_DIR/site.conf"
WIZARD=false
BUNDLE=""
ONLY=""
FROM=""
SKIP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config) CONFIG="${2:?}"; shift 2 ;;
    --wizard) WIZARD=true; shift ;;
    --bundle) BUNDLE="${2:?}"; shift 2 ;;
    --only) ONLY="${2:?}"; shift 2 ;;
    --from) FROM="${2:?}"; shift 2 ;;
    --skip) SKIP="${2:?}"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "모르는 인자: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "$WIZARD" == "true" ]]; then
  run_wizard "$CONFIG"
fi
[[ -f "$CONFIG" ]] || die "답안 파일이 없습니다: $CONFIG  (install/site.conf.example 를 복사하거나 --wizard)"

# shellcheck disable=SC1090
. "$CONFIG"
validate_config
require_root

# 오프라인 번들은 임시 디렉터리에 풀어 두고 각 단계가 BUNDLE_DIR 를 본다.
BUNDLE_DIR=""
if [[ -n "$BUNDLE" ]]; then
  [[ -f "$BUNDLE" ]] || die "번들 파일이 없습니다: $BUNDLE"
  BUNDLE_DIR="$(mktemp -d /tmp/kaster-bundle.XXXXXX)"
  log "번들 풀기: $BUNDLE → $BUNDLE_DIR"
  tar -xzf "$BUNDLE" -C "$BUNDLE_DIR"
  [[ -f "$BUNDLE_DIR/manifest.json" ]] || die "번들에 manifest.json 이 없습니다"
  info "번들: $(jq -r '"site=\(.siteCode) commit=\(.gitCommit) made=\(.builtAt)"' "$BUNDLE_DIR/manifest.json")"
  trap 'rm -rf "$BUNDLE_DIR"' EXIT
fi

# 단계 선택
phase_selected() {
  local p="$1"
  if [[ -n "$ONLY" ]]; then
    [[ ",$ONLY," == *",$p,"* ]] || return 1
  fi
  if [[ -n "$FROM" ]]; then
    local passed=false q
    for q in "${ALL_PHASES[@]}"; do
      [[ "$q" == "$FROM" ]] && passed=true
      [[ "$q" == "$p" ]] && break
    done
    [[ "$passed" == "true" ]] || return 1
  fi
  [[ -n "$SKIP" && ",$SKIP," == *",$p,"* ]] && return 1
  return 0
}

for p in $ONLY $FROM $SKIP; do
  for q in ${p//,/ }; do
    [[ " ${ALL_PHASES[*]} " == *" $q "* ]] || die "모르는 단계: $q (가능: ${ALL_PHASES[*]})"
  done
done

LOG_FILE="/var/log/kaster-install-${SITE_CODE}-$(date +%Y%m%d-%H%M%S).log"
if [[ "$DRY_RUN" != "true" ]]; then
  exec > >(tee -a "$LOG_FILE") 2>&1
fi

echo
log "KAster CTI 설치 — 사이트 $SITE_CODE · $(date -Iseconds)$( [[ "$DRY_RUN" == "true" ]] && printf ' · DRY-RUN')"
info "답안 $CONFIG · 저장소 $INSTALL_ROOT · 공인 IP $PUBLIC_IP"
[[ "$DRY_RUN" == "true" ]] || info "로그 $LOG_FILE"

# asterisk 단계가 manager.conf 에 넣을 AMI_SECRET 은 site 단계가 .env 에 넣는 값과 같아야 한다.
# .env 가 이미 있으면 그 값을, 없으면 지금 만들어 둘 다에 쓴다.
AMI_SECRET="$(read_kv "$(site_env)" AMI_SECRET 2>/dev/null || true)"
case "$AMI_SECRET" in ""|STRONG_AMI_PASSWORD|replace_with_*) AMI_SECRET="$(rand_secret 24)" ;; esac
export AMI_SECRET

START=$(date +%s)
for p in "${ALL_PHASES[@]}"; do
  if phase_selected "$p"; then
    echo
    log "━━ 단계 $p"
    "phase_$p"
  else
    info "단계 $p 건너뜀"
  fi
done

echo
log "끝. $(( $(date +%s) - START ))초"
if [[ "$DRY_RUN" != "true" && "${VERIFY_FAILED:-0}" -gt 0 ]]; then
  die "검증 ${VERIFY_FAILED}건 실패. 로그 $LOG_FILE"
fi
