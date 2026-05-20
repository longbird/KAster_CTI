$ErrorActionPreference = 'Stop'

$distro = 'KAster-CTI-Ubuntu'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$serverEnvPath = Join-Path $repoRoot 'apps/server/.env'

wsl -d $distro -- bash -lc @'
set -euo pipefail
pg_ctlcluster --skip-systemctl-redirect 16 main start >/dev/null || true
service redis-server start >/dev/null
pg_isready -h 127.0.0.1 -p 5432 >/dev/null
redis-cli --raw ping | grep -qx PONG
'@

$wslIp = (wsl -d $distro -- hostname -I).Trim().Split(' ')[0]

if (Test-Path -LiteralPath $serverEnvPath) {
  $envText = Get-Content -LiteralPath $serverEnvPath -Raw
} else {
  $envText = @"
PORT=3000
JWT_SECRET=change_me
AMI_HOST=127.0.0.1
AMI_PORT=5038
AMI_USERNAME=cti_middleware
AMI_SECRET=STRONG_AMI_PASSWORD
AMI_RECONNECT_MS=5000
"@
}

$databaseUrl = "postgresql://kaster:kaster@${wslIp}:5432/kaster_cti?schema=public"
if ($envText -match '(?m)^DATABASE_URL=') {
  $envText = $envText -replace '(?m)^DATABASE_URL=.*$', "DATABASE_URL=$databaseUrl"
} else {
  $envText = "DATABASE_URL=$databaseUrl`r`n$envText"
}

if ($envText -match '(?m)^REDIS_HOST=') {
  $envText = $envText -replace '(?m)^REDIS_HOST=.*$', "REDIS_HOST=$wslIp"
} else {
  $envText += "`r`nREDIS_HOST=$wslIp"
}

if ($envText -match '(?m)^REDIS_PORT=') {
  $envText = $envText -replace '(?m)^REDIS_PORT=.*$', 'REDIS_PORT=6379'
} else {
  $envText += "`r`nREDIS_PORT=6379"
}

Set-Content -LiteralPath $serverEnvPath -Value $envText -Encoding UTF8

Write-Host "Local PBX test infra is ready: PostgreSQL ${wslIp}:5432, Redis ${wslIp}:6379"
Write-Host "Updated apps/server/.env for local WSL test infra."
