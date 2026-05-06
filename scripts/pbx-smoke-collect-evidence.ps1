param(
  [Parameter(Mandatory = $true)]
  [string]$SiteName,

  [Parameter(Mandatory = $true)]
  [string]$RunSummaryPath,

  [Parameter(Mandatory = $true)]
  [string]$CallerId,

  [Parameter(Mandatory = $true)]
  [string]$Did,

  [string]$CallDetailsPath,
  [string]$ScenarioFile,
  [string]$QueueName,
  [string]$AgentExtension,
  [string]$SshHost = "blueadm@49.247.46.86",
  [string]$SshConfig = "NUL",
  [string]$RemoteRoot = "/home/blueadm/kaster_cti_rehearsals/20260503_221151",
  [string]$ComposeFile = "deploy/sites/rehearsal-20260501/compose.prod.yml",
  [string]$EnvFile = "deploy/sites/rehearsal-20260501/.env",
  [string]$ApiHostHeader = "api.49.247.46.86.nip.io",
  [string]$ApiBaseUrl = "http://127.0.0.1:5180/api/v1",
  [datetime]$SinceUtc = (Get-Date).ToUniversalTime().AddMinutes(-15),
  [string]$WsEventsPath,
  [string]$OutFile,
  [switch]$FailOnFailedVerdict
)

$ErrorActionPreference = "Stop"

function Resolve-ExistingPath([string]$PathValue, [string]$Label) {
  if (-not $PathValue) {
    return $null
  }
  $resolved = Resolve-Path -Path $PathValue -ErrorAction Stop
  if ($resolved.Count -ne 1) {
    throw "$Label must resolve to exactly one path: $PathValue"
  }
  return $resolved.Path
}

function Escape-SqlLiteral([string]$Value) {
  if ($null -eq $Value) {
    return ""
  }
  return $Value.Replace("'", "''")
}

function Invoke-RemoteBash([string]$Script) {
  $id = [Guid]::NewGuid().ToString("N")
  $localTemp = Join-Path ([IO.Path]::GetTempPath()) "kaster-smoke-$id.sh"
  $remoteTemp = "/tmp/kaster-smoke-$id.sh"
  try {
    Set-Content -Path $localTemp -Value $Script -Encoding ASCII
    & scp -F $SshConfig $localTemp "${SshHost}:$remoteTemp" | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "scp failed with exit code $LASTEXITCODE"
    }
    $sshArgs = @("-F", $SshConfig, $SshHost, "bash '$remoteTemp'; status=`$?; rm -f '$remoteTemp'; exit `$status")
    $output = & ssh @sshArgs
    if ($LASTEXITCODE -ne 0) {
      throw "remote command failed with exit code $LASTEXITCODE"
    }
    return ($output -join "`n")
  } finally {
    Remove-Item -Path $localTemp -Force -ErrorAction SilentlyContinue
  }
}

function ConvertTo-MarkdownJsonBlock($Value) {
  if ($null -eq $Value) {
    return ""
  }
  return ($Value | ConvertTo-Json -Depth 20)
}

function Add-Check(
  [System.Collections.ArrayList]$Checks,
  [string]$Area,
  [string]$Status,
  [string]$Detail
) {
  [void]$Checks.Add([pscustomobject]@{
    Area = $Area
    Status = $Status
    Detail = $Detail
  })
}

function Has-EventName($Events, [string]$Name) {
  return @($Events | Where-Object { $_.eventName -eq $Name }).Count -gt 0
}

function Has-DialRinging($Events) {
  return @($Events | Where-Object {
    $_.eventName -eq "DialState" -and [string]$_.dialStatus -eq "RINGING"
  }).Count -gt 0
}

function Has-UpConnectionEvent($Events) {
  return @($Events | Where-Object {
    ($_.eventName -in @("AgentConnect", "BridgeEnter")) -or
    ($_.eventName -in @("Newstate", "BridgeLeave", "HangupRequest") -and [string]$_.channelState -eq "Up")
  }).Count -gt 0
}

function Format-ChecksTable($Checks) {
  $lines = @(
    "| Area | Judgment |",
    "| --- | --- |"
  )
  foreach ($check in $Checks) {
    $lines += "| $($check.Area) | $($check.Status): $($check.Detail) |"
  }
  return ($lines -join "`n")
}

function Format-FailureClassificationTable($Checks) {
  $areaToLocation = @{
    "Health" = "CTI server"
    "PBX server" = "PBX server"
    "CTI server" = "CTI server"
    "DB" = "DB"
    "AMI events" = "CTI server"
    "Server logs" = "CTI server"
    "WebSocket" = "WebSocket"
  }
  $locationDetails = [ordered]@{
    "PBX server" = New-Object System.Collections.ArrayList
    "CTI server" = New-Object System.Collections.ArrayList
    "WebSocket" = New-Object System.Collections.ArrayList
    "DB" = New-Object System.Collections.ArrayList
    "Test input" = New-Object System.Collections.ArrayList
  }

  foreach ($check in $Checks) {
    if ($check.Status -notin @("FAIL", "WARN", "NOT_COLLECTED")) {
      continue
    }
    $location = $areaToLocation[$check.Area]
    if (-not $location) {
      $location = "Test input"
    }
    [void]$locationDetails[$location].Add("$($check.Area): $($check.Status) - $($check.Detail)")
  }

  if ([int]$summary.attempted -le 0) {
    [void]$locationDetails["Test input"].Add("Loadgen did not attempt any calls")
  }
  if (-not $firstDetail) {
    [void]$locationDetails["Test input"].Add("Call details CSV was not provided or was empty")
  }
  if (-not $scenarioPath) {
    [void]$locationDetails["Test input"].Add("Scenario file was not provided")
  }

  $lines = @(
    "| Failure location | Judgment | Next investigation point |",
    "| --- | --- | --- |"
  )
  foreach ($entry in $locationDetails.GetEnumerator()) {
    $items = @($entry.Value)
    if ($items.Count -eq 0) {
      $lines += "| $($entry.Key) | PASS | No issue detected by this gate |"
    } else {
      $lines += "| $($entry.Key) | REVIEW | $($items -join "<br>") |"
    }
  }
  return ($lines -join "`n")
}

$summaryPath = Resolve-ExistingPath $RunSummaryPath "RunSummaryPath"
$detailsPath = Resolve-ExistingPath $CallDetailsPath "CallDetailsPath"
$scenarioPath = Resolve-ExistingPath $ScenarioFile "ScenarioFile"
$wsPath = Resolve-ExistingPath $WsEventsPath "WsEventsPath"

$summary = Get-Content -Raw -Encoding UTF8 -Path $summaryPath | ConvertFrom-Json
$details = if ($detailsPath) { Import-Csv -Path $detailsPath } else { @() }
$firstDetail = @($details | Select-Object -First 1)[0]
$wsCapture = if ($wsPath) { Get-Content -Raw -Encoding UTF8 -Path $wsPath | ConvertFrom-Json } else { $null }

if (-not $OutFile) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutFile = "docs/qa/pbx-smoke-report-$SiteName-$stamp.md"
}

$outParent = Split-Path -Parent $OutFile
if ($outParent) {
  New-Item -ItemType Directory -Force -Path $outParent | Out-Null
}

$callerSql = Escape-SqlLiteral $CallerId
$didSql = Escape-SqlLiteral $Did
$queueWhere = ""
if ($QueueName) {
  $queueSql = Escape-SqlLiteral $QueueName
  $queueWhere = ' and \"queueName\"=' + "'" + $queueSql + "'"
}
$sinceIso = $SinceUtc.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$remoteScript = @"
set -euo pipefail
cd "$RemoteRoot"
set -a
. "$EnvFile"
set +a
CID=`$(docker compose --env-file "$EnvFile" -f "$ComposeFile" ps -q postgres)
HEALTH=`$(curl -fsS -H 'Host: $ApiHostHeader' "$ApiBaseUrl/health" || true)
SESSION=`$(docker exec -i "`$CID" psql -U "`$POSTGRES_USER" -d "`$POSTGRES_DB" -t -A -c "select coalesce(json_agg(row_to_json(t)), '[]'::json) from (select \"callId\", linkedid, \"sessionStatus\", ani, dnis, \"queueName\", \"primaryAgentId\", \"queuedAt\", \"ringingAt\", \"answeredAt\", \"endedAt\", \"talkSeconds\", \"createdAt\", \"updatedAt\" from \"callSessions\" where ani='$callerSql' and dnis='$didSql'$queueWhere and \"createdAt\" >= '$sinceIso'::timestamptz order by \"createdAt\" desc limit 1) t;")
LINKEDID=`$(printf '%s' "`$SESSION" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const rows=JSON.parse(s); console.log(rows[0]?.linkedid || '')})")
if [ -n "`$LINKEDID" ]; then
  EVENTS=`$(docker exec -i "`$CID" psql -U "`$POSTGRES_USER" -d "`$POSTGRES_DB" -t -A -c "select coalesce(json_agg(row_to_json(t)), '[]'::json) from (select \"eventName\", \"eventTime\", payload->>'queueName' as \"queueName\", payload->>'agentId' as \"agentId\", payload->'raw'->>'DialStatus' as \"dialStatus\", payload->'raw'->>'ChannelStateDesc' as \"channelState\", payload->'raw'->>'ConnectedLineNum' as \"connectedLineNum\", payload->'raw'->>'DestCallerIDNum' as \"destCallerIdNum\" from \"rawAmiEvents\" where linkedid='`$LINKEDID' order by \"eventTime\", \"eventId\") t;")
else
  EVENTS='[]'
fi
LOGS=`$(docker compose --env-file "$EnvFile" -f "$ComposeFile" logs --no-color --since '$sinceIso' server 2>&1 | grep -E 'Prisma|25P02|session create raced|Unhandled event|AMI connected|AMI login accepted|AMI socket closed' | tail -120 || true)
HEALTH="`$HEALTH" SESSION="`$SESSION" EVENTS="`$EVENTS" LOGS="`$LOGS" node -e "const out={health: JSON.parse(process.env.HEALTH || 'null'), session: JSON.parse(process.env.SESSION || '[]'), events: JSON.parse(process.env.EVENTS || '[]'), logs: process.env.LOGS || ''}; console.log(JSON.stringify(out));"
"@

$remoteJson = Invoke-RemoteBash $remoteScript
$remote = $remoteJson | ConvertFrom-Json
$session = @($remote.session | Select-Object -First 1)[0]
$events = @($remote.events)

$eventLines = if ($events.Count -gt 0) {
  $events | ForEach-Object {
    "{0}`t{1}`tqueue={2}`tagent={3}`tdial={4}`tstate={5}`tconnected={6}`tdest={7}" -f `
      $_.eventName, $_.eventTime, $_.queueName, $_.agentId, $_.dialStatus, $_.channelState, $_.connectedLineNum, $_.destCallerIdNum
  }
} else {
  @("(no events found)")
}

$healthText = ConvertTo-MarkdownJsonBlock $remote.health
$summaryText = ConvertTo-MarkdownJsonBlock $summary
$sessionText = ConvertTo-MarkdownJsonBlock $session
$wsText = ConvertTo-MarkdownJsonBlock $wsCapture
$logsText = if ($remote.logs) { [string]$remote.logs } else { "(no matching log lines)" }

$sipResult = if ($firstDetail) {
  "finalSipCode=$($firstDetail.finalSipCode), failureCode=$($firstDetail.failureCode)"
} else {
  "call details CSV not provided"
}

$checks = New-Object System.Collections.ArrayList

$healthOk = $remote.health -and
  $remote.health.success -eq $true -and
  $remote.health.data.status -eq "ok" -and
  $remote.health.data.checks.db -eq "up" -and
  $remote.health.data.checks.redis -eq "up" -and
  $remote.health.data.checks.ami -eq "connected"
if ($healthOk) {
  Add-Check $checks "Health" "PASS" "db/redis/ami are healthy"
} else {
  Add-Check $checks "Health" "FAIL" "health endpoint is not fully healthy"
}

$sipOk = [int]$summary.attempted -gt 0 -and
  [int]$summary.failed -eq 0 -and
  [int]$summary.connected -eq [int]$summary.attempted -and
  $firstDetail -and
  [string]$firstDetail.finalSipCode -eq "200" -and
  [string]$firstDetail.failureCode -eq "none"
if ($sipOk) {
  Add-Check $checks "PBX server" "PASS" "SIP call connected with 200 and no failure"
} else {
  Add-Check $checks "PBX server" "FAIL" "SIP result did not meet smoke criteria"
}

if ($session) {
  $sessionProblems = New-Object System.Collections.ArrayList
  if ($session.sessionStatus -ne "ENDED") { [void]$sessionProblems.Add("sessionStatus is $($session.sessionStatus)") }
  if ($session.ani -ne $CallerId) { [void]$sessionProblems.Add("ani mismatch") }
  if ($session.dnis -ne $Did) { [void]$sessionProblems.Add("dnis mismatch") }
  if ($QueueName -and $session.queueName -ne $QueueName) { [void]$sessionProblems.Add("queueName mismatch") }
  if ($AgentExtension -and -not $session.primaryAgentId) { [void]$sessionProblems.Add("primaryAgentId missing") }
  if (-not $session.answeredAt) { [void]$sessionProblems.Add("answeredAt missing") }
  if (-not $session.endedAt) { [void]$sessionProblems.Add("endedAt missing") }
  if ([int]$session.talkSeconds -le 0) { [void]$sessionProblems.Add("talkSeconds not positive") }

  if ($sessionProblems.Count -eq 0) {
    Add-Check $checks "CTI server" "PASS" "call session reached ENDED with required routing fields, answer, and talk time"
    Add-Check $checks "DB" "PASS" "callSessions row found for linkedid $($session.linkedid)"
  } else {
    Add-Check $checks "CTI server" "FAIL" ($sessionProblems -join "; ")
    Add-Check $checks "DB" "FAIL" "callSessions row is incomplete"
  }
} else {
  Add-Check $checks "CTI server" "FAIL" "callSessions row not found"
  Add-Check $checks "DB" "FAIL" "no callSessions row matched caller/DID criteria"
}

$hasQueueJoin = Has-EventName $events "QueueCallerJoin"
$hasNewchannel = Has-EventName $events "Newchannel"
$hasRinging = (Has-EventName $events "AgentCalled") -or (Has-DialRinging $events)
$hasConnected = Has-UpConnectionEvent $events
$hasHangup = Has-EventName $events "Hangup"
$queueRequired = -not [string]::IsNullOrWhiteSpace($QueueName)
$ringingRequired = $queueRequired -or (-not [string]::IsNullOrWhiteSpace($AgentExtension))
$amiEntryOk = if ($queueRequired) { $hasQueueJoin } else { $hasNewchannel }
$amiRingingOk = if ($ringingRequired) { $hasRinging } else { $true }
if ($amiEntryOk -and $amiRingingOk -and $hasConnected -and $hasHangup) {
  $entryLabel = if ($queueRequired) { "queue" } else { "newchannel" }
  $ringingLabel = if ($ringingRequired) { "ringing, " } else { "" }
  Add-Check $checks "AMI events" "PASS" ("{0}, {1}connected, and hangup events observed" -f $entryLabel, $ringingLabel)
} else {
  $missing = New-Object System.Collections.ArrayList
  if (-not $amiEntryOk) {
    if ($queueRequired) {
      [void]$missing.Add("QueueCallerJoin")
    } else {
      [void]$missing.Add("Newchannel")
    }
  }
  if (-not $amiRingingOk) { [void]$missing.Add("AgentCalled or DialState RINGING") }
  if (-not $hasConnected) { [void]$missing.Add("AgentConnect, BridgeEnter, or Up connection event") }
  if (-not $hasHangup) { [void]$missing.Add("Hangup") }
  Add-Check $checks "AMI events" "FAIL" ("missing " + ($missing -join ", "))
}

$logValue = [string]$remote.logs
if ($logValue -match "25P02|AMI socket closed|PrismaClient|Prisma.*(error|failed|exception)") {
  Add-Check $checks "Server logs" "FAIL" "fatal server log pattern found"
} else {
  $reviewLogLines = @($logValue -split "`n" | Where-Object {
    ($_ -match "Unhandled event" -and $_ -notmatch "Unhandled event (VarSet|Newexten|Newstate|NewConnectedLine|MixMonitorStart|DialBegin|RTCPReceived|SoftHangupRequest|QueueCallerLeave|DialEnd|AgentComplete)")
  })
  if ($reviewLogLines.Count -gt 0) {
    Add-Check $checks "Server logs" "WARN" "non-fatal review pattern found"
  } else {
    Add-Check $checks "Server logs" "PASS" "no error patterns found"
  }
}

if ($wsCapture) {
  $expectedLinkedid = if ($session) { [string]$session.linkedid } else { "" }
  $wsLifecycleEvents = @($wsCapture.events | Where-Object {
    $_.type -in @("call.created", "call.updated", "call.ended") -and
    ((-not $expectedLinkedid) -or [string]$_.payload.linkedid -eq $expectedLinkedid)
  })
  $wsEventNames = @($wsLifecycleEvents | ForEach-Object { $_.type })
  $hasWsCallCreated = $wsEventNames -contains "call.created"
  $hasWsCallUpdated = $wsEventNames -contains "call.updated"
  $hasWsCallEnded = $wsEventNames -contains "call.ended"
  if ($wsCapture.connected -eq $true -and $hasWsCallCreated -and $hasWsCallUpdated -and $hasWsCallEnded) {
    Add-Check $checks "WebSocket" "PASS" "call.created, call.updated, and call.ended observed for linkedid $expectedLinkedid"
  } elseif ($wsCapture.connected -eq $true -and [int]$wsCapture.eventCount -gt 0) {
    Add-Check $checks "WebSocket" "WARN" "WS connected and received events, but full lifecycle for linkedid $expectedLinkedid was not observed"
  } else {
    Add-Check $checks "WebSocket" "FAIL" "WS capture did not observe call events"
  }
} else {
  Add-Check $checks "WebSocket" "NOT_COLLECTED" "WS events file was not provided"
}

$failedChecks = @($checks | Where-Object { $_.Status -eq "FAIL" })
$warnChecks = @($checks | Where-Object { $_.Status -eq "WARN" })
$finalVerdict = if ($failedChecks.Count -gt 0) {
  "FAIL"
} elseif ($warnChecks.Count -gt 0) {
  "PASS_WITH_WARNINGS"
} else {
  "PASS"
}
$nextAction = if ($finalVerdict -eq "PASS" -and $WsEventsPath) {
  "Use this smoke as deployment gate evidence; run a queue-specific gate when stable SIP registration is required."
} elseif ($finalVerdict -eq "PASS") {
  "Promote this smoke to the deployment gate or add WebSocket capture."
} elseif ($finalVerdict -eq "PASS_WITH_WARNINGS") {
  "Review warnings before promoting this smoke to the deployment gate."
} else {
  "Investigate failed areas before deployment."
}
$checksTable = Format-ChecksTable $checks
$failureClassificationTable = Format-FailureClassificationTable $checks

$markdown = @"
# PBX Smoke Report

createdAt: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
site: $SiteName

## Inputs

| Field | Value |
| --- | --- |
| scenario file | $scenarioPath |
| DID | $Did |
| callerId | $CallerId |
| queue | $QueueName |
| agent extension | $AgentExtension |
| run summary json | $summaryPath |
| call details csv | $detailsPath |

## Run Result

| Check | Result | Evidence |
| --- | --- | --- |
| health after | collected | `/api/v1/health` |
| SIP run | attempted=$($summary.attempted), connected=$($summary.connected), failed=$($summary.failed) | $sipResult |

### Health

~~~json
$healthText
~~~

### Loadgen Summary

~~~json
$summaryText
~~~

## CTI DB

~~~json
$sessionText
~~~

## AMI Events

~~~text
$($eventLines -join "`n")
~~~

## Server Logs

Patterns: `Prisma`, `25P02`, `session create raced`, `Unhandled event`, `AMI connected`, `AMI login accepted`, `AMI socket closed`

~~~text
$logsText
~~~

## WebSocket Events

~~~json
$wsText
~~~

## Verdict

$checksTable

## Failure Classification

$failureClassificationTable

Final verdict: $finalVerdict

Next action: $nextAction
"@

Set-Content -Path $OutFile -Value $markdown -Encoding UTF8
Write-Host "Wrote $OutFile"
Write-Host "Final verdict: $finalVerdict"
if ($FailOnFailedVerdict -and $finalVerdict -eq "FAIL") {
  exit 2
}
