#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/deploy-prod.sh --site-dir deploy/sites/<site> [--env-file .env] [--skip-backup]

Runs the production deployment gate for one site:
  1. Validate compose/env files
  2. Backup PostgreSQL unless --skip-backup is set
  3. Pull/build images through compose
  4. Run prisma migrate deploy in the server container
  5. Restart the site stack
  6. Check API health through the gateway

Run from repository root on the target production host.
USAGE
}

SITE_DIR=""
ENV_FILE=".env"
SKIP_BACKUP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --site-dir)
      SITE_DIR="${2:-}"
      shift 2
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --skip-backup)
      SKIP_BACKUP=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

if [[ -z "$SITE_DIR" || ! -d "$SITE_DIR" ]]; then
  echo "--site-dir must point to an existing site directory" >&2
  exit 64
fi

COMPOSE_FILE="$SITE_DIR/compose.prod.yml"
ENV_PATH="$SITE_DIR/$ENV_FILE"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing compose file: $COMPOSE_FILE" >&2
  exit 65
fi
if [[ ! -f "$ENV_PATH" ]]; then
  echo "Missing env file: $ENV_PATH" >&2
  exit 65
fi

export COMPOSE_FILE
export ENV_PATH

echo "==> Validating compose config"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" config >/dev/null

if [[ "$SKIP_BACKUP" -eq 0 ]]; then
  BACKUP_DIR="$SITE_DIR/backups"
  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/postgres-$(date +%Y%m%d-%H%M%S).sql.gz"
  echo "==> Backing up PostgreSQL to $BACKUP_FILE"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" exec -T postgres \
    sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip -c > "$BACKUP_FILE"
fi

echo "==> Pulling/building images"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" pull || true
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" build

echo "==> Running DB migration"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" run --rm server npx prisma migrate deploy

echo "==> Restarting stack"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" up -d --remove-orphans

echo "==> Checking API health"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" exec -T gateway \
  sh -c 'wget -qO- http://server:3000/api/v1/health >/dev/null'

echo "Production deployment gate completed."
