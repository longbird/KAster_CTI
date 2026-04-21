#!/usr/bin/env bash
# 로컬 → 원격 증분 배포 + hot reload 도우미.
#
# 사용법:
#   ./scripts/deploy-dev.sh sync               # 소스만 빠르게 동기화 (rebuild 없음)
#   ./scripts/deploy-dev.sh sync-safe admin    # 동기화 + 서비스 재시작 + 원격 build 검증
#   ./scripts/deploy-dev.sh verify admin       # 원격 컨테이너 내부 build 검증
#   ./scripts/deploy-dev.sh release server     # 원격 Prisma sync + build + 재시작
#   ./scripts/deploy-dev.sh up                 # 최초 설치 + compose up
#   ./scripts/deploy-dev.sh restart            # 컨테이너 재시작
#   ./scripts/deploy-dev.sh down               # 컨테이너 종료
#   ./scripts/deploy-dev.sh logs               # server 로그 follow
#   ./scripts/deploy-dev.sh ssh                # 원격 ssh 열기
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

run_remote() {
  ssh "$REMOTE" "$1"
}

run_compose() {
  run_remote "cd ${REMOTE_DIR} && docker compose -f ${COMPOSE_FILE} $1"
}

sync_files() {
  run_remote "mkdir -p ${REMOTE_DIR}"
  echo ">>> rsync to ${REMOTE}:${REMOTE_DIR}"
  rsync -az --delete \
    --exclude 'node_modules' \
    --exclude 'dist' \
    --exclude '.git' \
    --exclude '.DS_Store' \
    --exclude '.superpowers' \
    --exclude '.agents' \
    --exclude 'docs/chatgpt-archive/html' \
    --exclude 'download' \
    --exclude '*.stackdump' \
    --exclude '*.tsbuildinfo' \
    --exclude '*.log' \
    --exclude '.env' \
    --exclude 'apps/admin/dev_output*.txt' \
    ./ "${REMOTE}:${REMOTE_DIR}/"
}

verify_service() {
  local service="${1:-all}"

  case "$service" in
    server)
      echo ">>> verify server build"
      run_remote "docker exec kaster-server sh -lc 'cd /app && npm run prisma:sync && npm run build'"
      ;;
    web)
      echo ">>> verify web build"
      run_remote "docker exec kaster-web sh -lc 'cd /app && npm run build'"
      ;;
    admin)
      echo ">>> verify admin build"
      run_remote "docker exec kaster-admin sh -lc 'cd /app && npm run build'"
      ;;
    all)
      verify_service server
      verify_service web
      verify_service admin
      ;;
    *)
      echo "unknown verify target: $service"
      echo "usage: $0 verify {server|web|admin|all}"
      exit 1
      ;;
  esac
}

restart_service() {
  local service="${1:-}"
  if [ -n "$service" ] && [ "$service" != "all" ]; then
    run_compose "restart ${service}"
  else
    run_compose "restart"
  fi
}

sync_safe() {
  local service="${1:-admin}"
  sync_files
  echo ">>> restart ${service}"
  restart_service "$service"
  verify_service "$service"
}

release_service() {
  local service="${1:-server}"
  sync_files
  verify_service "$service"
  echo ">>> restart ${service}"
  restart_service "$service"
}

case "$cmd" in
  sync)
    sync_files
    ;;
  sync-safe)
    sync_safe "${2:-admin}"
    ;;
  verify)
    verify_service "${2:-all}"
    ;;
  release)
    release_service "${2:-server}"
    ;;
  up)
    sync_files
    echo ">>> ensure remote dir exists"
    echo ">>> docker compose up -d"
    run_compose "up -d"
    ;;
  restart)
    run_compose "restart ${2:-}"
    ;;
  down)
    run_compose "down"
    ;;
  logs)
    run_compose "logs -f --tail=100 ${2:-server}"
    ;;
  ps)
    run_compose "ps"
    ;;
  ssh)
    ssh "$REMOTE"
    ;;
  *)
    echo "unknown command: $cmd"
    echo "usage: $0 {sync|sync-safe|verify|release|up|restart|down|logs|ps|ssh}"
    exit 1
    ;;
esac
