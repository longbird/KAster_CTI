#Requires -Version 5.1
<#
.SYNOPSIS
  상담원 데스크톱 배포본을 만든다 — 게시 · 서명 · 설치 파일 · 지문.

.DESCRIPTION
  산출물은 release/ 아래 두 개다.

    KAsterAgent-<버전>-Setup.exe   상담원이 실행하는 설치 파일
    release.json                    서버에 릴리스를 등록할 때 쓰는 값들

  release.json 의 sha256 은 <b>클라이언트가 받은 파일을 검증하는 유일한 근거</b>다
  (UpdateClient). 손으로 계산해 넣지 않는다 — 여기서 만든 값을 그대로 서버에 올린다.

.EXAMPLE
  pwsh tools/build-release.ps1 -Version 1.0.0
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  # 서명 인증서가 없어도 만들 수 있게 둔다 (내부 QA 용). 운영 배포에는 -RequireSign 을 붙인다.
  [switch]$RequireSign,

  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
  throw "버전은 x.y.z 형식이어야 합니다: $Version"
}

$desktopRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$repoRoot = Resolve-Path (Join-Path $desktopRoot '..\..')
$solution = Join-Path $desktopRoot 'KAster.Desktop.sln'
$appProject = Join-Path $desktopRoot 'src\KAster.Desktop.App\KAster.Desktop.App.csproj'
$issFile = Join-Path $desktopRoot 'installer\KAsterAgent.iss'
$releaseDir = Join-Path $desktopRoot 'release'
$publishDir = Join-Path $releaseDir 'publish'

function Resolve-IsccPath {
  $command = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
    'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
    'C:\Program Files\Inno Setup 6\ISCC.exe'
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }

  throw 'ISCC.exe 를 찾을 수 없습니다. Inno Setup 6 을 설치하세요 (winget install JRSoftware.InnoSetup).'
}

function Invoke-Checked([string]$What, [scriptblock]$Action) {
  Write-Host "==> $What" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$What 실패 (exit $LASTEXITCODE)"
  }
}

# --- 1. 테스트 -------------------------------------------------------------
# 배포본을 만들기 전에 돌린다. 깨진 채로 설치 파일이 나가면 되돌리는 비용이 훨씬 크다.
if (-not $SkipTests) {
  Invoke-Checked '테스트' { dotnet test $solution -c Release -v minimal }
}

# --- 2. 게시 ---------------------------------------------------------------
# self-contained 다. 상담원 PC 에 .NET 8 Desktop Runtime 을 따로 깔 필요가 없다 —
# 재택 상담원 PC 마다 런타임 배포 절차를 만드는 비용이 파일 크기보다 크다.
if (Test-Path -LiteralPath $releaseDir) {
  Remove-Item -LiteralPath $releaseDir -Recurse -Force
}
New-Item -ItemType Directory -Path $publishDir -Force | Out-Null

Invoke-Checked "게시 (win-x64 self-contained, $Version)" {
  dotnet publish $appProject `
    -c Release `
    -r win-x64 `
    --self-contained true `
    -p:Version=$Version `
    -p:SatelliteResourceLanguages=en `
    -o $publishDir `
    -v minimal
}

$publishedExe = Join-Path $publishDir 'KAster.Desktop.App.exe'
if (-not (Test-Path -LiteralPath $publishedExe)) {
  throw "게시 결과에 실행 파일이 없습니다: $publishedExe"
}

# 버전이 실제로 박혔는지 되읽어 확인한다. -p:Version 이 조용히 무시되면
# 1.0.0.0 짜리 배포본이 나가고, 그때부터 모든 자리가 "이미 최신" 으로 보인다.
$stamped = (Get-Item -LiteralPath $publishedExe).VersionInfo.ProductVersion
if (-not $stamped.StartsWith($Version)) {
  throw "실행 파일에 박힌 버전이 다릅니다. 기대: $Version, 실제: $stamped"
}
Write-Host "    실행 파일 버전: $stamped" -ForegroundColor DarkGray

# --- 3. 서명 (게시 결과) ---------------------------------------------------
$signScript = Join-Path $repoRoot 'apps\desktop\scripts\sign-internal.ps1'
$hasCert = $env:KASTER_SIGN_CERT_SHA1 -or $env:KASTER_SIGN_CERT_SUBJECT

if ($hasCert) {
  Invoke-Checked '서명 (게시 결과)' {
    & powershell -ExecutionPolicy Bypass -File $signScript -ArtifactRoot $publishDir
  }
}
elseif ($RequireSign) {
  throw 'KASTER_SIGN_CERT_SHA1 또는 KASTER_SIGN_CERT_SUBJECT 가 없어 서명할 수 없습니다.'
}
else {
  Write-Warning '서명 인증서가 없어 서명하지 않았습니다. 내부 QA 용으로만 쓰십시오.'
}

# --- 4. 설치 파일 ----------------------------------------------------------
$iscc = Resolve-IsccPath
Invoke-Checked '설치 파일 만들기' {
  & $iscc "/DAppVersion=$Version" "/DPublishDir=$publishDir" "/DOutputDir=$releaseDir" $issFile
}

$setupExe = Join-Path $releaseDir "KAsterAgent-$Version-Setup.exe"
if (-not (Test-Path -LiteralPath $setupExe)) {
  throw "설치 파일이 만들어지지 않았습니다: $setupExe"
}

# --- 5. 서명 (설치 파일) ---------------------------------------------------
# 게시 결과를 서명해도 설치 파일 자체는 별개의 실행 파일이다. 이것을 빼면
# 상담원이 실제로 더블클릭하는 파일이 서명 없는 파일이 된다.
if ($hasCert) {
  Invoke-Checked '서명 (설치 파일)' {
    & powershell -ExecutionPolicy Bypass -File $signScript -ArtifactRoot $releaseDir
  }
}

# --- 6. 지문 ---------------------------------------------------------------
$setupItem = Get-Item -LiteralPath $setupExe
$sha256 = (Get-FileHash -LiteralPath $setupExe -Algorithm SHA256).Hash.ToLowerInvariant()

$release = [ordered]@{
  artifactId = "agent-win-x64-$Version"
  version    = $Version
  channel    = 'stable'
  fileName   = $setupItem.Name
  sizeBytes  = $setupItem.Length
  sha256     = $sha256
  signed     = [bool]$hasCert
}

$releaseJson = Join-Path $releaseDir 'release.json'
$release | ConvertTo-Json | Set-Content -LiteralPath $releaseJson -Encoding UTF8

Write-Host ''
Write-Host '완료' -ForegroundColor Green
Write-Host "  설치 파일 : $setupExe"
Write-Host "  크기      : $([math]::Round($setupItem.Length / 1MB, 1)) MB"
Write-Host "  SHA256    : $sha256"
Write-Host "  서명      : $(if ($hasCert) { '있음' } else { '없음' })"
Write-Host "  메타      : $releaseJson"
