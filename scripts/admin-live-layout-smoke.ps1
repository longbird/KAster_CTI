param(
  [string]$BaseUrl = "http://49.247.46.86:5174",
  [string]$ApiBaseUrl = "http://49.247.46.86:3000/api/v1",
  [string]$LoginId = "supervisor1",
  [string]$Password = "Password123!",
  [string]$Extension = "2001",
  [int]$Width = 1260,
  [int]$Height = 768,
  [string]$OutDir = "reports/browser-checks"
)

$ErrorActionPreference = "Stop"

function Find-Edge {
  @(
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}

function Receive-CdpText([System.Net.WebSockets.ClientWebSocket]$Ws) {
  $segment = New-Object byte[] 1048576
  $buffer = [ArraySegment[byte]]::new($segment)
  $stream = New-Object System.IO.MemoryStream
  do {
    $result = $Ws.ReceiveAsync($buffer, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    if ($result.Count -gt 0) {
      $stream.Write($segment, 0, $result.Count)
    }
  } while (-not $result.EndOfMessage)
  [Text.Encoding]::UTF8.GetString($stream.ToArray())
}

$script:CdpId = 0
function Send-Cdp([System.Net.WebSockets.ClientWebSocket]$Ws, [string]$Method, $Params = @{}) {
  $script:CdpId++
  $payload = @{ id = $script:CdpId; method = $Method; params = $Params } | ConvertTo-Json -Depth 20 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $Ws.SendAsync(
    [ArraySegment[byte]]::new($bytes),
    [System.Net.WebSockets.WebSocketMessageType]::Text,
    $true,
    [Threading.CancellationToken]::None
  ).GetAwaiter().GetResult()

  while ($true) {
    $message = Receive-CdpText $Ws | ConvertFrom-Json
    if ($message.id -eq $script:CdpId) {
      if ($message.error) {
        throw ($message.error | ConvertTo-Json -Depth 10)
      }
      return $message.result
    }
  }
}

function Wait-DevTools([int]$Port) {
  for ($i = 0; $i -lt 80; $i++) {
    try {
      return Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 1
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  throw "DevTools endpoint did not start."
}

$edge = Find-Edge
if (-not $edge) {
  throw "Microsoft Edge was not found."
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resolvedOutDir = Join-Path $root $OutDir
New-Item -ItemType Directory -Force -Path $resolvedOutDir | Out-Null

$loginBody = @{ loginId = $LoginId; password = $Password; extension = $Extension } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "$ApiBaseUrl/auth/login" -ContentType "application/json" -Body $loginBody
$accessToken = $login.data.accessToken
$refreshToken = $login.data.refreshToken
$agentJson = $login.data.agent | ConvertTo-Json -Compress

$port = 9259
$profile = Join-Path $resolvedOutDir ("edge-layout-smoke-" + [DateTimeOffset]::Now.ToUnixTimeMilliseconds())
$edgeProcess = Start-Process -FilePath $edge -ArgumentList @(
  "--remote-debugging-port=$port",
  "--user-data-dir=$profile",
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--window-size=$Width,$Height",
  "about:blank"
) -PassThru -WindowStyle Hidden

try {
  Wait-DevTools $port | Out-Null
  $tab = Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:$port/json/new?about:blank"
  $ws = [System.Net.WebSockets.ClientWebSocket]::new()
  $ws.ConnectAsync([Uri]$tab.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

  Send-Cdp $ws "Page.enable" | Out-Null
  Send-Cdp $ws "Runtime.enable" | Out-Null
  Send-Cdp $ws "Emulation.setDeviceMetricsOverride" @{
    width = $Width
    height = $Height
    deviceScaleFactor = 1
    mobile = $false
  } | Out-Null

  Send-Cdp $ws "Page.navigate" @{ url = $BaseUrl } | Out-Null
  Start-Sleep -Milliseconds 1200

  $setSession = "localStorage.setItem('kaster.access_token', $($accessToken | ConvertTo-Json -Compress));" +
    "localStorage.setItem('kaster.refresh_token', $($refreshToken | ConvertTo-Json -Compress));" +
    "localStorage.setItem('kaster.agent', $(($agentJson) | ConvertTo-Json -Compress));" +
    "location.href='/dashboard?layoutSmoke=' + Date.now();"
  Send-Cdp $ws "Runtime.evaluate" @{ expression = $setSession; awaitPromise = $false } | Out-Null
  Start-Sleep -Milliseconds 3500

  $probe = @'
(() => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: Math.round(r.x), y: Math.round(r.y),
      width: Math.round(r.width), height: Math.round(r.height),
      display: cs.display,
      gridTemplateColumns: cs.gridTemplateColumns,
      gridTemplateRows: cs.gridTemplateRows,
      overflow: cs.overflow
    };
  };
  return {
    url: location.href,
    viewport: { w: innerWidth, h: innerHeight },
    bodyScroll: { w: document.body.scrollWidth, h: document.body.scrollHeight },
    cssHrefs: Array.from(document.styleSheets).map((s) => s.href).filter(Boolean),
    brandMark: rect('.brand-mark'),
    kpiStrip: rect('.dashboard-compact__kpi-strip'),
    kpiCells: Array.from(document.querySelectorAll('.dashboard-compact__kpi-cell')).map((el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }),
    callsWrap: rect('.dashboard-compact__calls'),
    callsKanban: rect('.active-calls-kanban'),
    bottom: rect('.dashboard-compact__bottom'),
    hasHorizontalOverflow: document.body.scrollWidth > innerWidth
  };
})()
'@

  $metrics = (Send-Cdp $ws "Runtime.evaluate" @{ expression = $probe; returnByValue = $true }).result.value
  $screenshotPath = Join-Path $resolvedOutDir ("admin-layout-smoke-$Width`x$Height.png")
  $shot = Send-Cdp $ws "Page.captureScreenshot" @{ format = "png"; captureBeyondViewport = $false }
  [IO.File]::WriteAllBytes($screenshotPath, [Convert]::FromBase64String($shot.data))
  $ws.Dispose()

  $failures = @()
  if (-not $metrics.cssHrefs -or $metrics.cssHrefs.Count -lt 1) { $failures += "No stylesheet href was loaded." }
  if (-not $metrics.brandMark -or $metrics.brandMark.width -gt 80 -or $metrics.brandMark.height -gt 80) { $failures += "Brand mark is not constrained." }
  if (-not $metrics.kpiStrip -or $metrics.kpiStrip.display -ne "grid") { $failures += "KPI strip is not grid." }
  if (-not $metrics.kpiCells -or $metrics.kpiCells.Count -lt 5) { $failures += "Expected at least 5 KPI cells." }
  if ($metrics.kpiCells -and (($metrics.kpiCells | Select-Object -ExpandProperty y -Unique).Count -gt 1)) { $failures += "KPI cells are not on one row." }
  if (-not $metrics.callsWrap -or $metrics.callsWrap.height -lt 260) { $failures += "Active calls section is too short." }
  if (-not $metrics.callsKanban -or $metrics.callsKanban.display -ne "grid") { $failures += "Active calls kanban is not grid." }
  if ($metrics.hasHorizontalOverflow) { $failures += "Horizontal overflow detected." }

  $result = [pscustomobject]@{
    ok = $failures.Count -eq 0
    failures = $failures
    screenshot = $screenshotPath
    metrics = $metrics
  }

  $result | ConvertTo-Json -Depth 20
  if ($failures.Count -gt 0) {
    exit 1
  }
} finally {
  if ($edgeProcess -and -not $edgeProcess.HasExited) {
    Stop-Process -Id $edgeProcess.Id -Force
  }
}
