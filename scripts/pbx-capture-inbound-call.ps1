param(
  [string]$PbxHost = "49.247.46.86",
  [string]$CaptureFilter,
  [string]$InterfaceDevice,
  [int]$DurationSeconds = 180,
  [string]$OutDir = "captures",
  [string]$Label = "inbound-call",
  [string]$DumpcapPath = "C:\Program Files\Wireshark\dumpcap.exe",
  [switch]$NoAnalyze,
  [string]$AnalyzeScript = "scripts/pbx-analyze-call-capture.ps1"
)

$ErrorActionPreference = "Stop"

function Resolve-CaptureDevice([string]$RemoteAddress) {
  $route = Find-NetRoute -RemoteIPAddress $RemoteAddress -ErrorAction Stop |
    Where-Object { $_.InterfaceIndex } |
    Select-Object -First 1
  if (-not $route) {
    throw "No route to $RemoteAddress. Check network connectivity."
  }
  $adapter = Get-NetAdapter -InterfaceIndex $route.InterfaceIndex -ErrorAction Stop
  if (-not $adapter.InterfaceGuid) {
    throw "Interface $($route.InterfaceIndex) has no GUID; pass -InterfaceDevice explicitly."
  }
  return @{
    Device = "\Device\NPF_$($adapter.InterfaceGuid)"
    Alias  = $adapter.Name
    Index  = $route.InterfaceIndex
  }
}

if (-not (Test-Path $DumpcapPath)) {
  throw "dumpcap not found at $DumpcapPath. Install Wireshark (with Npcap) or pass -DumpcapPath."
}

if (-not $CaptureFilter) {
  # The PBX sits behind upstream NAT, so the source address it reaches us from
  # is not knowable in advance, and the C# softphone binds ephemeral local
  # ports. Neither peer host nor port can be assumed: take all UDP and drop
  # only the well-known local chatter.
  $CaptureFilter = "udp and not port 53 and not port 67 and not port 68 and not port 137 and not port 138 and not port 1900 and not port 3702 and not port 5353"
}

if ($InterfaceDevice) {
  $device = $InterfaceDevice
  $deviceAlias = "(explicit)"
} else {
  $resolved = Resolve-CaptureDevice $PbxHost
  $device = $resolved.Device
  $deviceAlias = $resolved.Alias
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$resolvedOutDir = (Resolve-Path -Path $OutDir).Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$baseName = "$Label-$stamp"
$pcapPath = Join-Path $resolvedOutDir "$baseName.pcapng"
$logPath = Join-Path $resolvedOutDir "$baseName-dumpcap.log"

$localIp = (Find-NetRoute -RemoteIPAddress $PbxHost |
  Where-Object { $_.IPAddress } |
  Select-Object -First 1).IPAddress

Write-Host "== capture plan =="
Write-Host "  interface : $deviceAlias  $device"
Write-Host "  local ip  : $localIp"
Write-Host "  filter    : $CaptureFilter"
Write-Host "  duration  : $DurationSeconds s (auto stop)"
Write-Host "  output    : $pcapPath"
Write-Host ""
Write-Host "== place the inbound call now =="
Write-Host "  1. softphone registered on extension 1001"
Write-Host "  2. dial the DID from an outside phone"
Write-Host "  3. answer, talk about 15 s, hang up"
Write-Host "  capture stops by itself after $DurationSeconds s (Ctrl+C stops early and still closes the file)"
Write-Host ""

$dumpcapArgs = @(
  "-i", $device,
  "-f", $CaptureFilter,
  "-w", $pcapPath,
  "-a", "duration:$DurationSeconds"
)

& $DumpcapPath @dumpcapArgs 2>&1 | Tee-Object -FilePath $logPath
$captureExit = $LASTEXITCODE

if (-not (Test-Path $pcapPath)) {
  throw "dumpcap produced no capture file (exit code $captureExit). See $logPath"
}

$capinfosPath = Join-Path (Split-Path -Parent $DumpcapPath) "capinfos.exe"
$packetCount = "unknown"
if (Test-Path $capinfosPath) {
  $packetCount = (& $capinfosPath -c -M $pcapPath 2>$null |
    Select-String "Number of packets" |
    ForEach-Object { ($_.Line -split ":")[-1].Trim() } |
    Select-Object -First 1)
}

Write-Host ""
Write-Host "== capture done =="
Write-Host "  file    : $pcapPath"
Write-Host "  bytes   : $((Get-Item $pcapPath).Length)"
Write-Host "  packets : $packetCount"

if ($packetCount -eq "0") {
  Write-Warning "No packets matched '$CaptureFilter' on $deviceAlias. The softphone may not be talking to $PbxHost."
}

if (-not $NoAnalyze) {
  if (Test-Path $AnalyzeScript) {
    & (Resolve-Path $AnalyzeScript).Path -CapturePath $pcapPath
  } else {
    Write-Warning "Analyze script not found at $AnalyzeScript; skipping analysis."
  }
}

Write-Host ""
Write-Host "Wrote $pcapPath"
