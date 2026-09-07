#!/usr/bin/env bash
# 인터넷·Docker Hub 가 막힌 서버용 오프라인 번들을 만든다. 인터넷과 Docker 가 되는 PC 에서 실행한다.
#
#   install/make-offline-bundle.sh --site-dir deploy/sites/<site> [--out kaster-bundle-<site>.tgz]
#
# 번들 내용:
#   repo.tgz       저장소 스냅샷 (git archive HEAD — 커밋 안 된 변경은 들어가지 않는다)
#   images.tar     server·web·admin·capture-agent 이미지 + postgres:16 redis:7 nginx:1.27-alpine
#   debs/          Ubuntu 22.04 용 deb (docker.io, docker-compose-v2, asterisk 18.10, fail2ban, ufw, jq ...)
#   manifest.json  사이트 코드·커밋·빌드 시각·이미지 목록·VITE_API_BASE_URL
#
# web·admin 이미지는 사이트 .env 의 VITE_* 를 빌드 시점에 박으므로 번들은 사이트마다 따로 만든다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_DIR=""
OUT=""
UBUNTU_IMAGE="ubuntu:22.04"
BASE_IMAGES=(postgres:16 redis:7 nginx:1.27-alpine)
APT_PACKAGES=(git curl jq python3 ca-certificates gnupg openssl ufw fail2ban docker.io docker-compose-v2
  asterisk asterisk-config asterisk-modules asterisk-core-sounds-en asterisk-core-sounds-en-gsm asterisk-moh-opsound-gsm)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --site-dir) SITE_DIR="${2:?}"; shift 2 ;;
    --out) OUT="${2:?}"; shift 2 ;;
    -h|--help) sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "모르는 인자: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$SITE_DIR" ]] || { echo "--site-dir 가 필요합니다" >&2; exit 2; }
[[ -f "$SITE_DIR/.env" && -f "$SITE_DIR/compose.prod.yml" ]] || { echo "$SITE_DIR 에 .env 와 compose.prod.yml 이 있어야 합니다 (install.sh --only site 로 먼저 만든다)" >&2; exit 2; }
command -v docker >/dev/null || { echo "docker 가 필요합니다" >&2; exit 1; }

env_value() { grep -E "^$1=" "$SITE_DIR/.env" | tail -n 1 | sed "s/^$1=//"; }
SITE_CODE="$(env_value SITE_CODE)"
[[ -n "$SITE_CODE" ]] || { echo ".env 에 SITE_CODE 가 없습니다" >&2; exit 2; }
OUT="${OUT:-kaster-bundle-${SITE_CODE}-$(date +%Y%m%d).tgz}"
GIT_COMMIT="$(git -C "$ROOT" rev-parse HEAD)"
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export GIT_COMMIT BUILD_TIME

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
echo ">>> 작업 디렉터리 $WORK"

echo ">>> 1/4 저장소 스냅샷 ($GIT_COMMIT)"
if [[ -n "$(git -C "$ROOT" status --porcelain --untracked-files=no)" ]]; then
  echo "    ! 커밋되지 않은 변경이 있습니다. 번들에는 HEAD 만 들어갑니다" >&2
fi
git -C "$ROOT" archive --format=tar.gz -o "$WORK/repo.tgz" HEAD

echo ">>> 2/4 이미지 빌드·수집"
compose() { docker compose -f "$SITE_DIR/compose.prod.yml" --env-file "$SITE_DIR/.env" "$@"; }
compose build server web admin capture-agent
for img in "${BASE_IMAGES[@]}"; do docker pull "$img"; done
APP_IMAGES=()
for app in server web admin capture-agent; do
  docker tag "kaster/${SITE_CODE}-${app}:latest" "kaster/bundle-${app}:latest"
  APP_IMAGES+=("kaster/bundle-${app}:latest")
done
docker save -o "$WORK/images.tar" "${APP_IMAGES[@]}" "${BASE_IMAGES[@]}"

echo ">>> 3/4 Ubuntu 22.04 deb 수집 ($UBUNTU_IMAGE 컨테이너에서 의존성까지 내려받는다)"
mkdir -p "$WORK/debs"
MSYS_NO_PATHCONV=1 docker run --rm -v "$WORK/debs:/out" "$UBUNTU_IMAGE" bash -c "
  set -e
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  apt-get install -y --no-install-recommends --download-only ${APT_PACKAGES[*]}
  cp /var/cache/apt/archives/*.deb /out/
  chmod -R a+r /out
"
echo "    deb $(find "$WORK/debs" -name '*.deb' | wc -l)개"

echo ">>> 4/4 manifest + 압축"
{
  printf '{'
  printf '"siteCode":"%s",' "$SITE_CODE"
  printf '"gitCommit":"%s",' "$GIT_COMMIT"
  printf '"builtAt":"%s",' "$BUILD_TIME"
  printf '"ubuntu":"%s",' "$UBUNTU_IMAGE"
  printf '"viteApiBaseUrl":"%s",' "$(env_value VITE_API_BASE_URL)"
  printf '"images":["%s"]' "$(IFS='","'; echo "${APP_IMAGES[*]}" "${BASE_IMAGES[*]}" | sed 's/ /","/g')"
  printf '}\n'
} >"$WORK/manifest.json"
tar -C "$WORK" -czf "$OUT" repo.tgz images.tar debs manifest.json
echo ">>> 완료: $OUT ($(du -h "$OUT" | cut -f1))"
echo "    서버에서: sudo install/install.sh --config install/site.conf --bundle $OUT"
