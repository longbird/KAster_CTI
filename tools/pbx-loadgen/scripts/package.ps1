param(
  [string]$BuildType = "Release"
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$toolRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptRoot ".."))
$nativeBuildDir = Join-Path $toolRoot "native\build"
$distDir = Join-Path $toolRoot "dist\windows"
$pjRuntimePatterns = @(
  "pj*.dll",
  "pjsip*.dll",
  "pjsua*.dll",
  "pjmedia*.dll",
  "pjnath*.dll",
  "pjlib-util*.dll",
  "resample*.dll"
)

function Test-AssumeStaticPjproject {
  return $env:PBX_LOADGEN_ASSUME_STATIC_PJSIP -eq "1"
}

function Get-PjprojectSearchRoots {
  param(
    [string]$BinaryPath
  )

  $roots = @(
    (Split-Path $BinaryPath -Parent),
    $nativeBuildDir,
    (Join-Path $nativeBuildDir $BuildType)
  )

  if ($env:PJSIP_ROOT) {
    $roots += @(
      $env:PJSIP_ROOT,
      (Join-Path $env:PJSIP_ROOT "bin"),
      (Join-Path $env:PJSIP_ROOT "bin64"),
      (Join-Path $env:PJSIP_ROOT "lib"),
      (Join-Path $env:PJSIP_ROOT "lib64"),
      (Join-Path $env:PJSIP_ROOT "Release"),
      (Join-Path $env:PJSIP_ROOT "Debug")
    )
  }

  return $roots | Where-Object { $_ -and (Test-Path $_) } | Sort-Object -Unique
}

function Get-PjprojectRuntimeFiles {
  param(
    [string[]]$SearchRoots
  )

  $runtimeFiles = @()
  foreach ($root in $SearchRoots) {
    foreach ($pattern in $pjRuntimePatterns) {
      $runtimeFiles += Get-ChildItem -Path $root -File -Recurse -Filter $pattern -ErrorAction SilentlyContinue
    }
  }

  return $runtimeFiles | Sort-Object FullName -Unique
}

function Copy-RuntimeFile {
  param(
    [string]$SourcePath,
    [string]$TargetName
  )

  $resolvedTargetName = if ($TargetName) { $TargetName } else { Split-Path $SourcePath -Leaf }
  Copy-Item $SourcePath (Join-Path $distDir $resolvedTargetName) -Force
}

function Get-DependencyNames {
  param(
    [string]$BinaryPath
  )

  $dumpbin = Get-Command dumpbin -ErrorAction SilentlyContinue
  if (-not $dumpbin) {
    return @()
  }

  $output = & $dumpbin.Source /dependents $BinaryPath 2>$null
  if (-not $output) {
    return @()
  }

  $deps = @()
  foreach ($line in $output) {
    if ($line -match '^(?<name>(?:lib)?(?:pj|pjsip|pjsua|pjmedia|pjnath|pjlib-util|resample)[^ ]*\.dll)$') {
      $deps += $Matches.name
    }
  }

  return $deps | Sort-Object -Unique
}

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

$searchRoots = Get-PjprojectSearchRoots -BinaryPath $binaryPath
$dependencyNames = Get-DependencyNames -BinaryPath $binaryPath

if ($dependencyNames.Count -gt 0) {
  $missingDependencies = @()

  foreach ($dependencyName in $dependencyNames) {
    $foundDependency = $null
    foreach ($root in $searchRoots) {
      $foundDependency = Get-ChildItem -Path $root -File -Recurse -Filter $dependencyName -ErrorAction SilentlyContinue |
        Select-Object -First 1
      if ($foundDependency) {
        Copy-RuntimeFile -SourcePath $foundDependency.FullName -TargetName $dependencyName
        if ($foundDependency.Name -ne $dependencyName) {
          Copy-RuntimeFile -SourcePath $foundDependency.FullName -TargetName $foundDependency.Name
        }
        break
      }
    }

    if (-not $foundDependency) {
      $missingDependencies += $dependencyName
    }
  }

  if ($missingDependencies.Count -gt 0) {
    throw @"
pbx-loadgen appears to depend on pjproject DLLs, but some were not discoverable.
Search roots:
  $($searchRoots -join "`n  ")
Missing dependencies:
  $($missingDependencies -join "`n  ")
Point PJSIP_ROOT at a pjproject install or make the DLLs visible next to the binary before packaging.
"@
  }
} else {
  $runtimeFiles = Get-PjprojectRuntimeFiles -SearchRoots $searchRoots

  foreach ($runtimeFile in $runtimeFiles) {
    Copy-RuntimeFile -SourcePath $runtimeFile.FullName
  }

  if ($runtimeFiles.Count -eq 0) {
    if (Test-AssumeStaticPjproject) {
      Write-Host "No pjproject DLLs were discoverable; packaging continues because PBX_LOADGEN_ASSUME_STATIC_PJSIP=1."
    } else {
      throw @"
Unable to prove whether pbx-loadgen is statically linked to pjproject.
No pjproject DLLs were discovered and dumpbin did not yield dependency names.
Install Visual Studio dumpbin or set PJSIP_ROOT so the pjproject DLLs are discoverable.
If you know this build is fully static, rerun packaging with PBX_LOADGEN_ASSUME_STATIC_PJSIP=1.
"@
    }
  }
}
