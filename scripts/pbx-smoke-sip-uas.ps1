param(
  [string]$HostAddress = "49.247.46.86",
  [int]$Port = 36070,
  [string]$Extension = "3999",
  [Parameter(Mandatory = $true)]
  [string]$Password,
  [string]$Domain,
  [string]$ContactHost,
  [int]$LocalPort = 0,
  [int]$MaxSeconds = 90,
  [int]$ExitAfterAckMs = 1500,
  [string]$OutFile,
  [string]$NodeScript = "scripts/pbx-smoke-sip-uas.mjs"
)

$ErrorActionPreference = "Stop"

if (-not $Domain) {
  $Domain = $HostAddress
}

if ($OutFile) {
  $outParent = Split-Path -Parent $OutFile
  if ($outParent) {
    New-Item -ItemType Directory -Force -Path $outParent | Out-Null
  }
  $resolvedOutFile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutFile)
} else {
  $resolvedOutFile = $null
}

$resolvedNodeScript = Resolve-Path -Path $NodeScript -ErrorAction Stop
$config = @{
  hostAddress = $HostAddress
  port = $Port
  extension = $Extension
  password = $Password
  domain = $Domain
  contactHost = $ContactHost
  localPort = $LocalPort
  maxSeconds = $MaxSeconds
  exitAfterAckMs = $ExitAfterAckMs
  outFile = $resolvedOutFile
}

$env:KASTER_SIP_UAS_CONFIG = $config | ConvertTo-Json -Depth 6 -Compress
try {
  & node $resolvedNodeScript
  if ($LASTEXITCODE -ne 0) {
    throw "node SIP UAS failed with exit code $LASTEXITCODE"
  }
} finally {
  Remove-Item Env:KASTER_SIP_UAS_CONFIG -ErrorAction SilentlyContinue
}
