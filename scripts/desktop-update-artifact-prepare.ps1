param(
  [Parameter(Mandatory = $true)]
  [string]$ArtifactPath,

  [Parameter(Mandatory = $true)]
  [string]$Version,

  [string]$Channel = "stable",

  [string]$OutputDir = "dist\desktop-update"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ArtifactPath)) {
  throw "Artifact not found: $ArtifactPath"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$resolved = Resolve-Path -LiteralPath $ArtifactPath
$file = Get-Item -LiteralPath $resolved
$target = Join-Path $OutputDir $file.Name
Copy-Item -LiteralPath $file.FullName -Destination $target -Force

$hash = Get-FileHash -LiteralPath $target -Algorithm SHA256
$record = [ordered]@{
  version = $Version
  channel = $Channel
  fileName = $file.Name
  sizeBytes = (Get-Item -LiteralPath $target).Length
  sha256 = $hash.Hash.ToLowerInvariant()
  preparedAt = (Get-Date).ToUniversalTime().ToString("o")
}

$jsonPath = Join-Path $OutputDir "manifest-row-$Version.json"
$record | ConvertTo-Json | Set-Content -Path $jsonPath -Encoding UTF8

Write-Host "Artifact copied: $target"
Write-Host "Manifest row: $jsonPath"
Write-Host "SHA256: $($record.sha256)"
