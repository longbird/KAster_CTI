#!/bin/sh
set -e

echo ">>> prisma migrate deploy"
npx prisma migrate deploy

if [ "${AUTO_SEED_DEMO_DATA:-false}" = "true" ]; then
  echo ">>> seed demo data"
  node dist/prisma/seed.js || echo "seed already applied"
fi

exec node dist/src/main.js
