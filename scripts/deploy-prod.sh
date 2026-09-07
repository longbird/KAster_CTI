#!/usr/bin/env bash
# Site production deploy gate.
#
# Usage:
#   scripts/deploy-prod.sh --site-dir deploy/sites/<site-code>
#   scripts/deploy-prod.sh --site-dir deploy/sites/<site-code> --skip-backup

set -euo pipefail

SITE_DIR=""
SKIP_BACKUP="false"
SKIP_HEALTH="false"
NO_BUILD="false"

usage() {
  cat <<'USAGE'
usage: scripts/deploy-prod.sh --site-dir deploy/sites/<site-code> [--skip-backup] [--skip-health]

Required:
  --site-dir <path>   Directory containing compose.prod.yml and .env

Options:
  --skip-backup       Skip PostgreSQL backup. Use only for first deploy or rehearsal.
  --skip-health       Skip final HTTP readiness check.
  --no-build          Do not build images (offline bundle already loaded them).
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --site-dir)
      SITE_DIR="${2:-}"
      shift 2
      ;;
    --skip-backup)
      SKIP_BACKUP="true"
      shift
      ;;
    --skip-health)
      SKIP_HEALTH="true"
      shift
      ;;
    --no-build)
      NO_BUILD="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -z "$SITE_DIR" ]; then
  echo "--site-dir is required" >&2
  usage >&2
  exit 1
fi

if [ ! -d "$SITE_DIR" ]; then
  echo "site dir does not exist: $SITE_DIR" >&2
  exit 1
fi

COMPOSE_FILE="$SITE_DIR/compose.prod.yml"
ENV_FILE="$SITE_DIR/.env"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "missing env file: $ENV_FILE" >&2
  exit 1
fi

env_value() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | sed "s/^${key}=//" | sed 's/^"//;s/"$//'
}

require_env() {
  local key="$1"
  local value
  value="$(env_value "$key")"
  if [ -z "$value" ]; then
    echo "missing required env: $key" >&2
    exit 1
  fi
}

reject_placeholder() {
  local key="$1"
  local value
  value="$(env_value "$key")"
  case "$value" in
    change_me|change_me_*|replace_with_*|dev_secret_change_me_in_prod|kaster|kaster_turn_dev_secret)
      echo "placeholder/default secret remains: $key=$value" >&2
      exit 1
      ;;
  esac
}

echo ">>> preflight: required env"
for key in \
  SITE_CODE SITE_DOMAIN ADMIN_DOMAIN API_DOMAIN HTTP_PORT \
  POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD JWT_SECRET \
  AMI_HOST AMI_PORT AMI_USERNAME AMI_SECRET AMI_RECONNECT_MS \
  ASTERISK_NODE_ID ASTERISK_OUTBOUND_CONTEXT ASTERISK_CONF_DIR \
  REST_CORS_ORIGIN WS_CORS_ORIGIN KASTER_INTERNAL_SECRET \
  VITE_API_BASE_URL VITE_WS_URL VITE_USE_MOCK VITE_ACCESS_TOKEN_KEY
do
  require_env "$key"
done

for key in POSTGRES_PASSWORD JWT_SECRET AMI_SECRET KASTER_INTERNAL_SECRET; do
  reject_placeholder "$key"
done

SITE_CODE="$(env_value SITE_CODE)"
API_DOMAIN="$(env_value API_DOMAIN)"
HTTP_PORT="$(env_value HTTP_PORT)"
ASTERISK_CONF_DIR="$(env_value ASTERISK_CONF_DIR)"

MARKER_PATH="${ASTERISK_CONF_DIR%/}/.kaster-cti-config-owner"
if [ -f "$MARKER_PATH" ]; then
  MARKER_VALUE="$(cat "$MARKER_PATH" | tr -d '[:space:]')"
  if [ -n "$MARKER_VALUE" ] && [ "$MARKER_VALUE" != "$SITE_CODE" ]; then
    echo "PBX config owner marker mismatch: $MARKER_PATH has '$MARKER_VALUE', expected '$SITE_CODE'" >&2
    exit 1
  fi
fi

# 상담원 설치 파일 공개 다운로드는 profile 로 켠다 (.env AGENT_DOWNLOADS_ENABLED=true).
EXTRA_SERVICES=()
if [ "$(env_value AGENT_DOWNLOADS_ENABLED)" = "true" ]; then
  export COMPOSE_PROFILES=downloads
  EXTRA_SERVICES+=(agent-downloads)
fi

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

echo ">>> preflight: docker compose config"
compose config >/dev/null

mkdir -p "$SITE_DIR/backups"

if [ "$SKIP_BACKUP" != "true" ]; then
  if compose ps --status running postgres >/dev/null 2>&1; then
    BACKUP_FILE="$SITE_DIR/backups/postgres-$(date +%Y%m%d-%H%M%S).sql.gz"
    echo ">>> backup: $BACKUP_FILE"
    compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip -c > "$BACKUP_FILE"
    if [ ! -s "$BACKUP_FILE" ]; then
      echo "backup failed or empty: $BACKUP_FILE" >&2
      exit 1
    fi
  else
    echo ">>> backup: postgres is not running yet, assuming first deploy"
  fi
else
  echo ">>> backup: skipped by --skip-backup"
fi

# 서버 이미지에 빌드 식별자를 박는다. GET /admin/settings/system/version 이 이 값을 답한다.
GIT_COMMIT="$(git -C "$(dirname "$0")/.." rev-parse HEAD 2>/dev/null || echo "")"
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export GIT_COMMIT BUILD_TIME

if [ "$NO_BUILD" = "true" ]; then
  echo ">>> build images: skipped by --no-build"
else
  echo ">>> build images (commit=${GIT_COMMIT:-unknown})"
  compose build server web admin
fi

echo ">>> start services"
compose up -d postgres redis
compose up -d server
compose up -d web admin gateway "${EXTRA_SERVICES[@]}"

if [ "$SKIP_HEALTH" != "true" ]; then
  HEALTH_URL="http://${API_DOMAIN}/api/v1/health/ready"
  if [ "$HTTP_PORT" != "80" ]; then
    HEALTH_URL="http://${API_DOMAIN}:${HTTP_PORT}/api/v1/health/ready"
  fi

  echo ">>> health: $HEALTH_URL"
  for _attempt in $(seq 1 30); do
    if curl -fsS "$HEALTH_URL" >/dev/null; then
      echo ">>> deploy complete"
      exit 0
    fi
    sleep 2
  done

  echo "health check failed after retries: $HEALTH_URL" >&2
  compose logs --tail=120 server >&2 || true
  exit 1
fi

echo ">>> deploy complete"
