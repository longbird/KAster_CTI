param(
  [string]$ApiBaseUrl = "http://49.247.46.86:5180/api/v1",
  [string]$WsBaseUrl = "http://49.247.46.86:5180",
  [string]$ApiHostHeader = "api.49.247.46.86.nip.io",
  [string]$LoginId = "supervisor1",
  [string]$Extension = "2001",
  [string]$Password,
  [string]$AccessToken,
  [int]$DurationSeconds = 90,
  [string]$OutFile = "docs/qa/ws-events-latest.json",
  [string]$NodeWorkDir = "apps/web"
)

$ErrorActionPreference = "Stop"

if (-not $AccessToken -and -not $Password) {
  throw "Provide -AccessToken or -Password."
}

$resolvedNodeWorkDir = Resolve-Path -Path $NodeWorkDir -ErrorAction Stop
if (-not (Test-Path (Join-Path $resolvedNodeWorkDir "node_modules/socket.io-client"))) {
  throw "socket.io-client was not found under $resolvedNodeWorkDir. Run npm install in apps/web first."
}

$outParent = Split-Path -Parent $OutFile
if ($outParent) {
  New-Item -ItemType Directory -Force -Path $outParent | Out-Null
}
$resolvedOutFile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutFile)

$scriptId = [Guid]::NewGuid().ToString("N")
$nodeScript = Join-Path $resolvedNodeWorkDir "tmp-ws-capture-$scriptId.mjs"

$source = @'
import { io } from "socket.io-client";
import { writeFileSync } from "node:fs";

const config = JSON.parse(process.env.KASTER_WS_CAPTURE_CONFIG || "{}");
const startedAt = new Date().toISOString();
const events = [];
const errors = [];
let connected = false;
let token = config.accessToken;

async function login() {
  if (token) return token;
  const response = await fetch(`${config.apiBaseUrl}/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "host": config.apiHostHeader,
    },
    body: JSON.stringify({
      loginId: config.loginId,
      extension: config.extension,
      password: config.password,
    }),
  });
  const body = await response.json();
  if (!response.ok || body?.error || !body?.data?.accessToken) {
    throw new Error(`login failed: ${JSON.stringify(body)}`);
  }
  token = body.data.accessToken;
  return token;
}

function record(type, payload) {
  events.push({
    type,
    at: new Date().toISOString(),
    payload,
  });
}

try {
  await login();
  const socket = io(`${config.wsBaseUrl}/ws`, {
    auth: { token },
    extraHeaders: {
      host: config.apiHostHeader,
    },
    transports: ["websocket", "polling"],
    reconnection: false,
  });

  for (const name of config.eventNames) {
    socket.on(name, (payload) => record(name, payload));
  }

  socket.on("connect", () => {
    connected = true;
    record("socket.connected", { id: socket.id });
  });
  socket.on("disconnect", (reason) => record("socket.disconnected", { reason }));
  socket.on("connect_error", (error) => {
    errors.push({ at: new Date().toISOString(), message: error.message });
  });

  await new Promise((resolve) => setTimeout(resolve, config.durationSeconds * 1000));
  socket.disconnect();
} catch (error) {
  errors.push({ at: new Date().toISOString(), message: error.message });
}

writeFileSync(config.outFile, JSON.stringify({
  startedAt,
  endedAt: new Date().toISOString(),
  connected,
  eventCount: events.filter((event) => !event.type.startsWith("socket.")).length,
  events,
  errors,
}, null, 2));
'@

try {
  Set-Content -Path $nodeScript -Value $source -Encoding ASCII
  $config = @{
    apiBaseUrl = $ApiBaseUrl.TrimEnd("/")
    wsBaseUrl = $WsBaseUrl.TrimEnd("/")
    apiHostHeader = $ApiHostHeader
    loginId = $LoginId
    extension = $Extension
    password = $Password
    accessToken = $AccessToken
    durationSeconds = $DurationSeconds
    outFile = $resolvedOutFile
    eventNames = @(
      "call.created",
      "call.updated",
      "call.ended",
      "screenpop.customer",
      "agent.status.changed",
      "queue.summary.updated"
    )
  }
  $env:KASTER_WS_CAPTURE_CONFIG = $config | ConvertTo-Json -Depth 8 -Compress
  Push-Location $resolvedNodeWorkDir
  try {
    & node $nodeScript
    if ($LASTEXITCODE -ne 0) {
      throw "node ws capture failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
} finally {
  Remove-Item -Path $nodeScript -Force -ErrorAction SilentlyContinue
  Remove-Item Env:KASTER_WS_CAPTURE_CONFIG -ErrorAction SilentlyContinue
}

Write-Host "Wrote $OutFile"
