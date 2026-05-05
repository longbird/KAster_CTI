param(
  [string]$SiteName = "rehearsal-20260501",
  [string]$ScenarioFile = "tools/pbx-loadgen/test-templates/sites/rehearsal-20260501-smoke.yaml",
  [string]$LoadgenExe = "tools/pbx-loadgen/dist/windows/pbx-loadgen.exe",
  [Parameter(Mandatory = $true)]
  [string]$CallerId,
  [Parameter(Mandatory = $true)]
  [string]$Did,
  [string]$QueueName,
  [string]$AgentExtension,
  [switch]$StartSipUas,
  [string]$SipUasScript = "scripts/pbx-smoke-sip-uas.ps1",
  [string]$SipUasNodeScript = "scripts/pbx-smoke-sip-uas.mjs",
  [ValidateSet("local", "server-container")]
  [string]$SipUasMode = "local",
  [string]$SipUasContainer = "kaster-rehearsal-20260501-server",
  [string]$SipHostAddress = "49.247.46.86",
  [int]$SipPort = 36070,
  [string]$SipExtension = "3999",
  [string]$SipPassword,
  [string]$SipContactHost,
  [int]$SipUasMaxSeconds = 90,
  [int]$SipUasExitAfterAckMs = 1500,
  [string]$SipUasEventsPath,
  [switch]$CaptureWebSocket,
  [string]$WsPassword,
  [string]$WsAccessToken,
  [string]$ApiBaseUrl = "http://api.49.247.46.86.nip.io:5180/api/v1",
  [string]$WsBaseUrl = "http://api.49.247.46.86.nip.io:5180",
  [string]$ApiHostHeader = "api.49.247.46.86.nip.io",
  [string]$SshHost = "blueadm@49.247.46.86",
  [string]$SshConfig = "NUL",
  [int]$WsDurationSeconds = 95,
  [string]$RunSummaryPath,
  [string]$CallDetailsPath,
  [string]$OutFile,
  [string]$WsEventsPath,
  [switch]$SkipDryRun
)

$ErrorActionPreference = "Stop"

function Resolve-RepoPath([string]$PathValue, [string]$Label, [switch]$AllowMissing) {
  if (-not $PathValue) {
    return $null
  }
  if ([IO.Path]::IsPathRooted($PathValue)) {
    $candidate = $PathValue
  } else {
    $candidate = Join-Path (Get-Location) $PathValue
  }
  if (-not $AllowMissing -and -not (Test-Path $candidate)) {
    throw "$Label not found: $PathValue"
  }
  return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($candidate)
}

function Invoke-Step([string]$Name, [scriptblock]$Block) {
  Write-Host "== $Name =="
  & $Block
}

function Resolve-ArtifactPath([string]$PathValue) {
  if ([IO.Path]::IsPathRooted($PathValue)) {
    return $PathValue
  }
  return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath((Join-Path (Get-Location) $PathValue))
}

$repoRoot = Resolve-Path -Path (Get-Location) -ErrorAction Stop
$scenarioPath = Resolve-RepoPath $ScenarioFile "ScenarioFile"
$loadgenPath = Resolve-RepoPath $LoadgenExe "LoadgenExe"

if (-not $OutFile) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutFile = "docs/qa/pbx-smoke-report-$SiteName-gate-$stamp.md"
}
if (-not $WsEventsPath) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $WsEventsPath = "docs/qa/ws-events-$SiteName-gate-$stamp.json"
}

$wsJob = $null
$sipUasJob = $null
$wsScript = Join-Path $repoRoot "scripts/pbx-smoke-capture-ws.ps1"
$collectorScript = Join-Path $repoRoot "scripts/pbx-smoke-collect-evidence.ps1"
$resolvedSipUasScript = Resolve-RepoPath $SipUasScript "SipUasScript"
$resolvedSipUasNodeScript = Resolve-RepoPath $SipUasNodeScript "SipUasNodeScript"

if ($StartSipUas -and -not $SipPassword) {
  throw "Provide -SipPassword when -StartSipUas is used."
}
if (-not $SipUasEventsPath) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $SipUasEventsPath = "docs/qa/sip-uas-events-$SiteName-gate-$stamp.json"
}

if ($CaptureWebSocket) {
  if (-not $WsPassword -and -not $WsAccessToken) {
    throw "Provide -WsPassword or -WsAccessToken when -CaptureWebSocket is used."
  }
  $wsArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $wsScript,
    "-ApiBaseUrl", $ApiBaseUrl,
    "-WsBaseUrl", $WsBaseUrl,
    "-ApiHostHeader", $ApiHostHeader,
    "-DurationSeconds", $WsDurationSeconds.ToString(),
    "-OutFile", $WsEventsPath
  )
  if ($WsPassword) {
    $wsArgs += @("-Password", $WsPassword)
  }
  if ($WsAccessToken) {
    $wsArgs += @("-AccessToken", $WsAccessToken)
  }
  Invoke-Step "start websocket capture" {
    $script:wsJob = Start-Job -ScriptBlock {
      param($workDir, $arguments)
      Set-Location $workDir
      & powershell @arguments
      exit $LASTEXITCODE
    } -ArgumentList $repoRoot.Path, $wsArgs
    Start-Sleep -Seconds 3
    Write-Host "WS capture job started: $($script:wsJob.Id)"
  }
}

if ($RunSummaryPath -and $CallDetailsPath) {
  $summaryPath = Resolve-RepoPath $RunSummaryPath "RunSummaryPath"
  $detailsPath = Resolve-RepoPath $CallDetailsPath "CallDetailsPath"
} else {
  Invoke-Step "validate scenario" {
    & $loadgenPath validate -f $scenarioPath
    if ($LASTEXITCODE -ne 0) {
      throw "pbx-loadgen validate failed with exit code $LASTEXITCODE"
    }
  }

  if (-not $SkipDryRun) {
    Invoke-Step "dry-run scenario" {
      & $loadgenPath dry-run -f $scenarioPath
      if ($LASTEXITCODE -ne 0) {
        throw "pbx-loadgen dry-run failed with exit code $LASTEXITCODE"
      }
    }
  }

  if ($StartSipUas) {
    Invoke-Step "start sip uas" {
      if ($SipUasMode -eq "server-container") {
        $contactHost = if ($SipContactHost) { $SipContactHost } else { "172.20.0.7" }
        $containerOutFile = "/tmp/$(Split-Path -Leaf $SipUasEventsPath)"
        $config = @{
          hostAddress = $SipHostAddress
          port = $SipPort
          extension = $SipExtension
          password = $SipPassword
          domain = $SipHostAddress
          contactHost = $contactHost
          maxSeconds = $SipUasMaxSeconds
          exitAfterAckMs = $SipUasExitAfterAckMs
          outFile = $containerOutFile
        } | ConvertTo-Json -Depth 6 -Compress
        New-Item -ItemType Directory -Force -Path ".tmp" | Out-Null
        $configTemp = Join-Path ".tmp" "kaster-sip-uas-$([Guid]::NewGuid().ToString('N')).json"
        Set-Content -Path $configTemp -Value $config -Encoding ASCII
        $script:sipUasJob = Start-Job -ScriptBlock {
          param($workDir, $sshConfig, $sshHost, $nodeScript, $configPath, $container, $eventsPath)
          Set-Location $workDir
          $remoteNode = "/tmp/kaster-smoke-sip-uas-$([Guid]::NewGuid().ToString('N')).mjs"
          $remoteConfig = "/tmp/kaster-smoke-sip-uas-$([Guid]::NewGuid().ToString('N')).json"
          $remoteEvents = "/tmp/$(Split-Path -Leaf $eventsPath)"
          Write-Output "SIP UAS remote mode: node=$nodeScript config=$configPath events=$eventsPath container=$container"
          & scp -F $sshConfig $nodeScript "${sshHost}:$remoteNode" | Out-Null
          if ($LASTEXITCODE -ne 0) { throw "scp node script failed with exit code $LASTEXITCODE" }
          Write-Output "SIP UAS node script copied"
          & scp -F $sshConfig $configPath "${sshHost}:$remoteConfig" | Out-Null
          if ($LASTEXITCODE -ne 0) { throw "scp config failed with exit code $LASTEXITCODE" }
          Write-Output "SIP UAS config copied"
          $remoteRunner = "/tmp/kaster-smoke-sip-uas-run-$([Guid]::NewGuid().ToString('N')).sh"
          $remoteScriptTemp = Join-Path ".tmp" "kaster-sip-uas-run-$([Guid]::NewGuid().ToString('N')).sh"
          $remote = @"
set -e
docker cp '$remoteNode' '${container}:/tmp/kaster-smoke-sip-uas.mjs'
docker cp '$remoteConfig' '${container}:/tmp/kaster-smoke-sip-uas-config.json'
status=0
docker exec '$container' sh -lc 'export KASTER_SIP_UAS_CONFIG="`$(cat /tmp/kaster-smoke-sip-uas-config.json)"; node /tmp/kaster-smoke-sip-uas.mjs' || status=`$?
docker cp '${container}:$remoteEvents' '$remoteEvents' >/dev/null 2>&1 || true
rm -f '$remoteNode' '$remoteConfig'
status=`$(printf '%s' "`$status" | tr -dc '0-9')
if [ -z "`$status" ]; then status=1; fi
if [ "`$status" -ne 0 ] && [ -s '$remoteEvents' ] && grep -q '"registered":true' '$remoteEvents' && grep -q '"inviteSeen":true' '$remoteEvents' && grep -q '"ackSeen":true' '$remoteEvents'; then
  status=0
fi
if [ "`$status" -ne 0 ]; then
  false
fi
rm -f '$remoteNode' '$remoteConfig' '$remoteRunner'
"@
          $remote = ($remote -replace "`r`n", "`n") -replace "`r", ""
          [System.IO.File]::WriteAllText($remoteScriptTemp, $remote, [System.Text.UTF8Encoding]::new($false))
          & scp -F $sshConfig $remoteScriptTemp "${sshHost}:$remoteRunner" | Out-Null
          if ($LASTEXITCODE -ne 0) { throw "scp remote runner failed with exit code $LASTEXITCODE" }
          $output = ssh -F $sshConfig $sshHost bash $remoteRunner
          $exit = $LASTEXITCODE
          Remove-Item -Path $remoteScriptTemp -Force -ErrorAction SilentlyContinue
          $output | ForEach-Object { Write-Output $_ }
          if (($output -join "`n") -match '"registered"\s*:\s*true' -and ($output -join "`n") -match '"inviteSeen"\s*:\s*true' -and ($output -join "`n") -match '"ackSeen"\s*:\s*true') {
            $exit = 0
          }
          Write-Output "SIP UAS remote process exit=$exit"
          & scp -F $sshConfig "${sshHost}:$remoteEvents" $eventsPath | Out-Null
          if ((Test-Path $eventsPath) -and $exit -ne 0) {
            try {
              $events = Get-Content -Raw -Encoding UTF8 -Path $eventsPath | ConvertFrom-Json
              if ($events.registered -eq $true -and $events.inviteSeen -eq $true -and $events.ackSeen -eq $true) {
                Write-Output "SIP UAS artifact confirms REGISTER/INVITE/ACK; overriding remote exit=$exit"
                $exit = 0
              }
            } catch {
              Write-Output "SIP UAS artifact parse failed: $($_.Exception.Message)"
            }
          }
          if ($exit -ne 0) { throw "remote SIP UAS failed with exit code $exit" }
        } -ArgumentList $repoRoot.Path, $SshConfig, $SshHost, $SipUasNodeScript, $configTemp, $SipUasContainer, $SipUasEventsPath
      } else {
        $sipUasArgs = @(
          "-NoProfile",
          "-ExecutionPolicy", "Bypass",
          "-File", $resolvedSipUasScript,
          "-HostAddress", $SipHostAddress,
          "-Port", $SipPort.ToString(),
          "-Extension", $SipExtension,
          "-Password", $SipPassword,
          "-MaxSeconds", $SipUasMaxSeconds.ToString(),
          "-OutFile", $SipUasEventsPath
        )
        if ($SipUasExitAfterAckMs -ge 0) {
          $sipUasArgs += @("-ExitAfterAckMs", $SipUasExitAfterAckMs.ToString())
        }
        if ($SipContactHost) {
          $sipUasArgs += @("-ContactHost", $SipContactHost)
        }
        $script:sipUasJob = Start-Job -ScriptBlock {
          param($workDir, $arguments)
          Set-Location $workDir
          & powershell @arguments
          exit $LASTEXITCODE
        } -ArgumentList $repoRoot.Path, $sipUasArgs
      }
      Start-Sleep -Seconds 3
      if ($script:sipUasJob.State -ne "Running") {
        $oldErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
          $sipOutput = Receive-Job $script:sipUasJob -Keep -ErrorAction Continue 2>&1
        } finally {
          $ErrorActionPreference = $oldErrorActionPreference
        }
        $sipOutput | ForEach-Object { Write-Host $_ }
        throw "SIP UAS failed to stay running: $($script:sipUasJob.State)"
      }
      Write-Host "SIP UAS job started: $($script:sipUasJob.Id)"
    }
  }

  Invoke-Step "run scenario" {
    $runOutput = & $loadgenPath run -f $scenarioPath 2>&1
    $exitCode = $LASTEXITCODE
    $runOutput | ForEach-Object { Write-Host $_ }
    if ($exitCode -ne 0) {
      throw "pbx-loadgen run failed with exit code $exitCode"
    }
    $line = ($runOutput | Where-Object { $_ -match "json=.*csv=" } | Select-Object -Last 1)
    if (-not $line -or $line -notmatch "json=(\S+)\s+csv=(\S+)") {
      throw "unable to parse pbx-loadgen artifact paths"
    }
    $script:summaryPath = Resolve-ArtifactPath $Matches[1]
    $script:detailsPath = Resolve-ArtifactPath $Matches[2]
  }
}

if ($sipUasJob) {
  Invoke-Step "wait sip uas" {
    Wait-Job $sipUasJob -Timeout ($SipUasMaxSeconds + 15) | Out-Null
    $oldErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      $sipOutput = Receive-Job $sipUasJob -Keep -ErrorAction Continue 2>&1
    } finally {
      $ErrorActionPreference = $oldErrorActionPreference
    }
    $sipOutput | ForEach-Object { Write-Host $_ }
    if ($sipUasJob.State -eq "Running") {
      Stop-Job $sipUasJob -ErrorAction SilentlyContinue
      throw "SIP UAS timed out"
    }
    if ($sipUasJob.State -ne "Completed") {
      throw "SIP UAS failed: $($sipUasJob.State)"
    }
    Remove-Job $sipUasJob -Force -ErrorAction SilentlyContinue
  }
}

if ($wsJob) {
  Invoke-Step "wait websocket capture" {
    Wait-Job $wsJob -Timeout ($WsDurationSeconds + 30) | Out-Null
    $wsOutput = Receive-Job $wsJob -Keep
    $wsOutput | ForEach-Object { Write-Host $_ }
    if ($wsJob.State -eq "Running") {
      Stop-Job $wsJob -ErrorAction SilentlyContinue
      throw "websocket capture timed out"
    }
    if ($wsJob.State -ne "Completed") {
      throw "websocket capture failed: $($wsJob.State)"
    }
    Remove-Job $wsJob -Force -ErrorAction SilentlyContinue
  }
}

$collectorArgs = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", $collectorScript,
  "-SiteName", $SiteName,
  "-RunSummaryPath", $summaryPath,
  "-CallDetailsPath", $detailsPath,
  "-CallerId", $CallerId,
  "-Did", $Did,
  "-ScenarioFile", $scenarioPath,
  "-OutFile", $OutFile,
  "-FailOnFailedVerdict"
)
if ($QueueName) {
  $collectorArgs += @("-QueueName", $QueueName)
}
if ($AgentExtension) {
  $collectorArgs += @("-AgentExtension", $AgentExtension)
}
if ($CaptureWebSocket -or (Test-Path (Resolve-RepoPath $WsEventsPath "WsEventsPath" -AllowMissing))) {
  $collectorArgs += @("-WsEventsPath", (Resolve-RepoPath $WsEventsPath "WsEventsPath"))
}

Invoke-Step "collect evidence and verdict" {
  & powershell @collectorArgs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
