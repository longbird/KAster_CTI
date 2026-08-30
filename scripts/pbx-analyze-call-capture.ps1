param(
  [Parameter(Mandatory = $true)]
  [string]$CapturePath,
  [string]$OutFile,
  [string]$TsharkPath = "C:\Program Files\Wireshark\tshark.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $TsharkPath)) {
  throw "tshark not found at $TsharkPath. Install Wireshark or pass -TsharkPath."
}

$resolvedCapture = (Resolve-Path -Path $CapturePath -ErrorAction Stop).Path
$captureDir = Split-Path -Parent $resolvedCapture
$baseName = [IO.Path]::GetFileNameWithoutExtension($resolvedCapture)

if (-not $OutFile) {
  $OutFile = Join-Path $captureDir "$baseName-report.md"
}
$sipDumpPath = Join-Path $captureDir "$baseName-sip.txt"

# RTP rides on dynamically negotiated ports; the heuristic dissector plus the
# captured SDP is what lets tshark classify it as RTP instead of plain UDP.
$rtpOpts = @("--enable-heuristic", "rtp_udp")

function Invoke-Tshark([string[]]$TsharkArgs) {
  $output = & $TsharkPath @TsharkArgs 2>&1
  if ($LASTEXITCODE -ne 0) {
    return @("tshark exited with code $LASTEXITCODE") + $output
  }
  if (-not $output) {
    return @("(no rows)")
  }
  return $output
}

function Add-Section([System.Collections.Generic.List[string]]$Report, [string]$Title, [string[]]$Body) {
  $Report.Add("")
  $Report.Add("## $Title")
  $Report.Add("")
  $Report.Add('```')
  foreach ($line in $Body) {
    $Report.Add([string]$line)
  }
  $Report.Add('```')
}

Write-Host "== analyzing $resolvedCapture =="

$report = [System.Collections.Generic.List[string]]::new()
$report.Add("# Inbound call capture report - $baseName")
$report.Add("")
$report.Add("| | |")
$report.Add("|---|---|")
$report.Add("| capture file | ``$resolvedCapture`` |")
$report.Add("| size | $((Get-Item $resolvedCapture).Length) bytes |")
$report.Add("| analyzed at | $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss K') |")
$report.Add("| tshark | $((& $TsharkPath -v | Select-Object -First 1)) |")

Write-Host "-- protocol hierarchy"
Add-Section $report "Protocol hierarchy" (Invoke-Tshark @($rtpOpts + @("-r", $resolvedCapture, "-q", "-z", "io,phs")))

Write-Host "-- SIP ladder"
Add-Section $report "SIP message ladder" (Invoke-Tshark @(
  "-r", $resolvedCapture, "-n", "-Y", "sip",
  "-T", "fields", "-E", "separator=|",
  "-e", "frame.number", "-e", "frame.time_relative",
  "-e", "ip.src", "-e", "udp.srcport", "-e", "ip.dst", "-e", "udp.dstport",
  "-e", "sip.Request-Line", "-e", "sip.Status-Line", "-e", "sip.Call-ID"
))

Write-Host "-- SIP statistics"
Add-Section $report "SIP statistics" (Invoke-Tshark @("-r", $resolvedCapture, "-n", "-q", "-z", "sip,stat"))

Write-Host "-- SDP media"
Add-Section $report "SDP media negotiation" (Invoke-Tshark @(
  "-r", $resolvedCapture, "-n", "-Y", "sdp",
  "-T", "fields", "-E", "separator=|",
  "-e", "frame.number", "-e", "ip.src", "-e", "ip.dst",
  "-e", "sdp.connection_info.address", "-e", "sdp.media", "-e", "sdp.media_attr"
))

Write-Host "-- RTP streams"
Add-Section $report "RTP streams (loss / jitter)" (Invoke-Tshark @($rtpOpts + @("-r", $resolvedCapture, "-n", "-q", "-z", "rtp,streams")))

Write-Host "-- RTCP"
Add-Section $report "RTCP reports" (Invoke-Tshark @($rtpOpts + @(
  "-r", $resolvedCapture, "-n", "-Y", "rtcp",
  "-T", "fields", "-E", "separator=|",
  "-e", "frame.number", "-e", "frame.time_relative",
  "-e", "ip.src", "-e", "ip.dst", "-e", "rtcp.pt",
  "-e", "rtcp.ssrc.fraction", "-e", "rtcp.ssrc.cum_nr", "-e", "rtcp.ssrc.jitter"
)))

Write-Host "-- DTMF (RFC2833)"
Add-Section $report "DTMF events (RFC 2833)" (Invoke-Tshark @($rtpOpts + @(
  "-r", $resolvedCapture, "-n", "-Y", "rtpevent",
  "-T", "fields", "-E", "separator=|",
  "-e", "frame.number", "-e", "frame.time_relative",
  "-e", "ip.src", "-e", "rtpevent.event_id", "-e", "rtpevent.end_of_event"
)))

Write-Host "-- UDP conversations"
Add-Section $report "UDP conversations" (Invoke-Tshark @($rtpOpts + @("-r", $resolvedCapture, "-n", "-q", "-z", "conv,udp")))

$report.Add("")
$report.Add("Full SIP message bodies: ``$sipDumpPath``")

Write-Host "-- full SIP dump"
$sipDump = Invoke-Tshark @("-r", $resolvedCapture, "-n", "-Y", "sip", "-O", "sip", "-P")
Set-Content -Path $sipDumpPath -Value $sipDump -Encoding utf8

Set-Content -Path $OutFile -Value $report -Encoding utf8

Write-Host ""
Write-Host "Wrote $OutFile"
Write-Host "Wrote $sipDumpPath"
