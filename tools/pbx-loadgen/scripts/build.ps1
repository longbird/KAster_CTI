param(
  [string]$BuildType = "Release",
  [string]$PjsipRoot = $env:PJSIP_ROOT
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$nativeDir = [System.IO.Path]::GetFullPath((Join-Path $scriptRoot "..\native"))
$buildDir = [System.IO.Path]::GetFullPath((Join-Path $nativeDir "build"))

$cmakeCommand = Get-Command cmake.exe -ErrorAction SilentlyContinue
if (-not $cmakeCommand) {
  $cmakeCommand = Get-Command cmake -ErrorAction Stop
}
$cmake = $cmakeCommand.Source

$configureArgs = @("-S", $nativeDir, "-B", $buildDir)
if ($PjsipRoot) {
  $configureArgs += "-DPJSIP_ROOT=$PjsipRoot"
}

& $cmake @configureArgs -DCMAKE_BUILD_TYPE=$BuildType
& $cmake --build $buildDir --config $BuildType
