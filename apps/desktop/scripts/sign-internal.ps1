[CmdletBinding()]
param(
  [string]$ArtifactRoot = (Join-Path $PSScriptRoot '..\release'),
  [string]$CertificateThumbprint = $env:KASTER_SIGN_CERT_SHA1,
  [string]$CertificateSubjectName = $env:KASTER_SIGN_CERT_SUBJECT,
  [string]$TimestampUrl = $env:KASTER_SIGN_TIMESTAMP_URL,
  [switch]$UseMachineStore
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
    throw "서명할 release 경로가 없습니다: $Root"
  }

  $patterns = @('*.exe', '*.dll')
  $files = foreach ($pattern in $patterns) {
    Get-ChildItem -Path $Root -Recurse -File -Filter $pattern -ErrorAction SilentlyContinue
  }

  return $files |
    Sort-Object FullName -Unique |
    Where-Object { $_.FullName -notmatch '\\resources\\elevate\.exe$' }
}

function New-SignArguments([System.IO.FileInfo]$File) {
  $arguments = @('sign', '/fd', 'SHA256', '/td', 'SHA256')

  if ($TimestampUrl) {
    $arguments += @('/tr', $TimestampUrl)
  }

  if ($CertificateThumbprint) {
    $arguments += @('/sha1', $CertificateThumbprint)
  }
  elseif ($CertificateSubjectName) {
    $arguments += @('/n', $CertificateSubjectName, '/a')
  }
  else {
    throw 'KASTER_SIGN_CERT_SHA1 또는 KASTER_SIGN_CERT_SUBJECT 중 하나를 지정해야 합니다.'
  }

  if ($UseMachineStore) {
    $arguments += '/sm'
  }

  $arguments += @('/d', 'KAster Agent', '/du', 'https://kaster.local/desktop', $File.FullName)
  return $arguments
}

$signToolPath = Resolve-SignToolPath
$resolvedArtifactRoot = (Resolve-Path -LiteralPath $ArtifactRoot).Path
$targetFiles = Get-TargetFiles -Root $resolvedArtifactRoot

if (-not $targetFiles -or $targetFiles.Count -eq 0) {
  throw "서명할 .exe/.dll 파일이 없습니다: $resolvedArtifactRoot"
}

Write-Host "Using SignTool: $signToolPath"
Write-Host "Artifact Root: $resolvedArtifactRoot"
Write-Host "Files to sign: $($targetFiles.Count)"

foreach ($file in $targetFiles) {
  $arguments = New-SignArguments -File $file
  Write-Host "Signing $($file.FullName)"
  & $signToolPath @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "signtool sign 실패: $($file.FullName)"
  }
}

Write-Host 'Internal code signing completed.'
