[CmdletBinding()]
param(
  [string]$ArtifactRoot = (Join-Path $PSScriptRoot '..\release')
)

$ErrorActionPreference = 'Stop'

function Resolve-SignToolPath {
  $command = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $sdkRoots = @(
    'C:\Program Files (x86)\Windows Kits\10\bin',
    'C:\Program Files\Windows Kits\10\bin'
  )

  foreach ($sdkRoot in $sdkRoots) {
    if (-not (Test-Path -LiteralPath $sdkRoot)) {
      continue
    }

    $candidate = Get-ChildItem -Path $sdkRoot -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      Select-Object -First 1

    if ($candidate) {
      return $candidate.FullName
    }
  }

  throw 'signtool.exe 를 찾을 수 없습니다. Windows SDK 또는 Visual Studio Build Tools 를 설치하세요.'
}

function Get-TargetFiles([string]$Root) {
  if (-not (Test-Path -LiteralPath $Root)) {
    throw "검증할 release 경로가 없습니다: $Root"
  }

  $patterns = @('*.exe', '*.dll')
  $files = foreach ($pattern in $patterns) {
    Get-ChildItem -Path $Root -Recurse -File -Filter $pattern -ErrorAction SilentlyContinue
  }

  return $files |
    Sort-Object FullName -Unique |
    Where-Object { $_.FullName -notmatch '\\resources\\elevate\.exe$' }
}

$signToolPath = Resolve-SignToolPath
$resolvedArtifactRoot = (Resolve-Path -LiteralPath $ArtifactRoot).Path
$targetFiles = Get-TargetFiles -Root $resolvedArtifactRoot

if (-not $targetFiles -or $targetFiles.Count -eq 0) {
  throw "검증할 .exe/.dll 파일이 없습니다: $resolvedArtifactRoot"
}

Write-Host "Using SignTool: $signToolPath"
Write-Host "Artifact Root: $resolvedArtifactRoot"
Write-Host "Files to verify: $($targetFiles.Count)"

foreach ($file in $targetFiles) {
  Write-Host "Verifying $($file.FullName)"

  $authenticode = Get-AuthenticodeSignature -FilePath $file.FullName
  if ($authenticode.Status -ne 'Valid') {
    throw "Authenticode 검증 실패: $($file.FullName) / Status=$($authenticode.Status)"
  }

  & $signToolPath verify /pa /all /tw $file.FullName
  if ($LASTEXITCODE -ne 0) {
    throw "signtool verify 실패: $($file.FullName)"
  }
}

Write-Host 'Signature verification completed.'
