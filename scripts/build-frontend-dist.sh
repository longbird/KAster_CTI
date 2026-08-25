#!/usr/bin/env bash
# 원격 배포용 프런트엔드(admin/web) 정적 빌드 + 검증.
#
# 왜 이 스크립트가 있나
# ---------------------
# Vite 는 `VITE_*` 값을 <b>빌드 시점에 번들 안으로 박아 넣는다.</b> 그래서 로컬에서
# `npm run build` 를 그냥 돌리면 개발용 `.env` 가 그대로 들어간다. 2026-08-24 에
# 그렇게 만든 admin 번들을 운영에 올려 `VITE_API_BASE_URL=http://localhost:3000`
# 과 `VITE_USE_MOCK=true` 가 박혔고, 관리자 화면이 통째로 "Network Error" 가 됐다.
#
# 눈으로 확인하는 절차는 또 틀린다. 그래서 여기서 <b>값을 강제로 주입하고, 만들어진
# 번들을 되읽어 검증</b>한다. 검증에 실패하면 산출물을 남기지 않는다 — 잘못된 번들이
# 디스크에 있으면 누군가 그걸 올린다.
#
# 사용법:
#   ./scripts/build-frontend-dist.sh admin
#   ./scripts/build-frontend-dist.sh web
#   KASTER_PUBLIC_HOST=1.2.3.4 ./scripts/build-frontend-dist.sh admin
set -euo pipefail

APP="${1:-}"
if [ "$APP" != "admin" ] && [ "$APP" != "web" ]; then
  echo "사용법: $0 {admin|web}" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/apps/$APP"
COMPOSE="$ROOT/docker-compose.dev.yml"

# 기본값은 compose 파일에서 읽는다. 운영 주소의 단일 진실원이 거기이므로,
# 이 스크립트에 또 하나의 사본을 만들지 않는다.
PUBLIC_HOST="${KASTER_PUBLIC_HOST:-}"
if [ -z "$PUBLIC_HOST" ]; then
  PUBLIC_HOST="$(grep -oE 'VITE_API_BASE_URL: *http://[0-9a-zA-Z.:_-]+' "$COMPOSE" \
    | head -1 | sed -E 's#.*http://([0-9a-zA-Z._-]+).*#\1#')"
fi
if [ -z "$PUBLIC_HOST" ]; then
  echo "오류: 공개 호스트를 알 수 없다. KASTER_PUBLIC_HOST 로 지정한다." >&2
  exit 1
fi

API_BASE="http://${PUBLIC_HOST}:3000/api/v1"
WS_URL="http://${PUBLIC_HOST}:3000"

echo ">>> $APP 빌드 (API=$API_BASE, MOCK=false)"
cd "$APP_DIR"
rm -rf dist

VITE_API_BASE_URL="$API_BASE" \
VITE_WS_URL="$WS_URL" \
VITE_USE_MOCK="false" \
VITE_ACCESS_TOKEN_KEY="kaster.access_token" \
  npx vite build --mode production

BUNDLE_DIR="$APP_DIR/dist/assets"
echo ">>> 번들 검증"

fail() {
  echo "검증 실패: $1" >&2
  echo "잘못된 산출물을 남기지 않는다 — dist 를 지운다." >&2
  rm -rf "$APP_DIR/dist"
  exit 1
}

grep -rqF "$API_BASE" "$BUNDLE_DIR" \
  || fail "번들에 운영 API 주소($API_BASE)가 없다."

# 개발 주소가 한 글자라도 남아 있으면 배포하지 않는다. 이것이 2026-08-24 의 사고였다.
if grep -rqE "localhost:(3000|5173|5174)|127\.0\.0\.1:(3000|5173|5174)" "$BUNDLE_DIR"; then
  fail "번들에 개발용 localhost 주소가 남아 있다."
fi

echo ">>> OK — $APP_DIR/dist"
grep -rhoE "http://[0-9a-zA-Z.:_-]+/api/v1" "$BUNDLE_DIR" | sort -u | sed 's/^/    API: /'
