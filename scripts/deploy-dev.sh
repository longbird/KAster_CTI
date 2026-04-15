#!/usr/bin/env bash
# 로컬 → 원격 증분 배포 + hot reload 도우미.
#
# 사용법:
#   ./scripts/deploy-dev.sh sync       # 소스만 빠르게 동기화 (rebuild 없음)
#   ./scripts/deploy-dev.sh up         # 최초 설치 + compose up
#   ./scripts/deploy-dev.sh restart    # 컨테이너 재시작
#   ./scripts/deploy-dev.sh down       # 컨테이너 종료
#   ./scripts/deploy-dev.sh logs       # server 로그 follow
#   ./scripts/deploy-dev.sh ssh        # 원격 ssh 열기
#
# 전제: SSH 키가 원격 authorized_keys 에 등록되어 있어 password 없이 붙음.
#
# 편집 흐름:
#   1. 로컬에서 코드 편집
#   2. ./scripts/deploy-dev.sh sync   (1초 이내, 변경 파일만)
#   3. Nest/Vite watcher 가 자동 감지 → 즉시 반영, rebuild 없음
#
# node_modules, dist, .git, .DS_Store 는 rsync 에서 제외됨.

set -euo pipefail

REMOTE="${KASTER_REMOTE:-blueadm@49.247.46.86}"
REMOTE_DIR="${KASTER_REMOTE_DIR:-/home/blueadm/kaster_cti}"
COMPOSE_FILE="docker-compose.dev.yml"

cmd="${1:-sync}"

sync_files() {
  echo ">>> rsync to ${REMOTE}:${REMOTE_DIR}"
  rsync -az --delete \
    --exclude 'node_modules' \
    --exclude 'dist' \
    --exclude '.git' \
    --exclude '.DS_Store' \
    --exclude 'docs/chatgpt-archive/html' \
    --exclude 'download' \
    --exclude '*.log' \
    --exclude '.env' \
    ./ "${REMOTE}:${REMOTE_DIR}/"
}

case "$cmd" in
  sync)
    sync_files
    ;;
  up)
    sync_files
    echo ">>> ensure remote dir exists"
    ssh "$REMOTE" "mkdir -p ${REMOTE_DIR}"
    echo ">>> docker compose up -d"
    ssh "$REMOTE" "cd ${REMOTE_DIR} && docker compose -f ${COMPOSE_FILE} up -d"
    ;;
  restart)
    ssh "$REMOTE" "cd ${REMOTE_DIR} && docker compose -f ${COMPOSE_FILE} restart ${2:-}"
    ;;
  down)
    ssh "$REMOTE" "cd ${REMOTE_DIR} && docker compose -f ${COMPOSE_FILE} down"
    ;;
  logs)
    ssh "$REMOTE" "cd ${REMOTE_DIR} && docker compose -f ${COMPOSE_FILE} logs -f --tail=100 ${2:-server}"
    ;;
  ps)
    ssh "$REMOTE" "cd ${REMOTE_DIR} && docker compose -f ${COMPOSE_FILE} ps"
    ;;
  ssh)
    ssh "$REMOTE"
    ;;
  *)
    echo "unknown command: $cmd"
    echo "usage: $0 {sync|up|restart|down|logs|ps|ssh}"
    exit 1
    ;;
esac
