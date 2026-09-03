# Local PBX Test Infra

This repo uses a D-drive WSL distro for local PostgreSQL and Redis tests. Do not
install or store this test infra on C.

## Layout

- WSL distro: `KAster-CTI-Ubuntu`
- Distro directory: `D:\Work\AI_Projects\_local_env\KAster_CTI\wsl\KAster-CTI-Ubuntu`
- Database: `kaster_cti`
- Database user/password: `kaster` / `kaster`
- Redis port: `6379`

## Start

From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-local-test-infra.ps1
```

The script starts PostgreSQL and Redis inside the D-drive WSL distro, reads the
current WSL IP, and updates the ignored `apps/server/.env` file:

- `DATABASE_URL=postgresql://kaster:kaster@<WSL_IP>:5432/kaster_cti?schema=public`
- `REDIS_HOST=<WSL_IP>`
- `REDIS_PORT=6379`

## Fresh Local Schema

The current historical Prisma migrations do not apply cleanly to a fresh DB in
lexical order: branch DID/mapping migrations reference `branches` and PBX DID
tables before those tables are created. Do not rewrite old migrations just for a
local test DB unless that checksum impact has been accepted.

For local test bootstrap, reset the local DB and push the current schema:

```powershell
wsl -d KAster-CTI-Ubuntu -- bash -lc "pg_ctlcluster --skip-systemctl-redirect 16 main start >/dev/null || true; su - postgres -c 'dropdb --if-exists kaster_cti'; su - postgres -c 'createdb -O kaster kaster_cti'"

cd apps/server
npx prisma db push
npx ts-node prisma/seed.ts
```

## Smoke Checks

```powershell
$sql = @'
SELECT 1 FROM pg_indexes WHERE indexname='branchDids_tenantId_didId_key';
SELECT column_name
FROM information_schema.columns
WHERE table_name='queues'
  AND column_name IN ('distributionMode','unconditionalTargetType','unconditionalTargetValue')
ORDER BY column_name;
'@
$sql | wsl -d KAster-CTI-Ubuntu -- bash -lc "PGPASSWORD=kaster psql -h 127.0.0.1 -U kaster -d kaster_cti"
```
