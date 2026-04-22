param(
  [string]$BuildType = "Release"
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$toolRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptRoot ".."))
$nativeBuildDir = Join-Path $toolRoot "native\build"
$distDir = Join-Path $toolRoot "dist\windows"

New-Item -ItemType Directory -Force -Path $distDir | Out-Null

$candidatePaths = @(
  (Join-Path $nativeBuildDir "$BuildType\pbx-loadgen.exe"),
  (Join-Path $nativeBuildDir "pbx-loadgen.exe")
)

$binaryPath = $candidatePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $binaryPath) {
  throw "Unable to find pbx-loadgen.exe under $nativeBuildDir"
}

Copy-Item $binaryPath $distDir -Force
Copy-Item (Join-Path $toolRoot "scenarios\*.yaml") $distDir -Force
