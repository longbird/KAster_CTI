param(
  [Parameter(Mandatory = $true)]
  [string]$ApiBaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$AccessToken,

  [switch]$ApplyReload
)

$ErrorActionPreference = "Stop"

$base = $ApiBaseUrl.TrimEnd("/")
$headers = @{ Authorization = "Bearer $AccessToken" }

Write-Host "PBX config dry-run: $base/api/v1/asterisk-config/dry-run"
$dryRun = Invoke-RestMethod -Method Get -Uri "$base/api/v1/asterisk-config/dry-run" -Headers $headers
$data = if ($dryRun.data) { $dryRun.data } else { $dryRun }

Write-Host "GeneratedAt: $($data.generatedAt)"
Write-Host "Validation OK: $($data.validation.ok)"

$data.diff | ForEach-Object {
  Write-Host ("{0}: {1} (+{2}/-{3})" -f $_.fileName, $_.status, $_.addedLines, $_.removedLines)
}

if (-not $data.validation.ok) {
  $data.validation.checks |
    Where-Object { $_.status -ne "pass" } |
    ForEach-Object { Write-Error ("{0}: {1}" -f $_.name, $_.detail) }
  exit 2
}

if (-not $ApplyReload) {
  Write-Host "Dry-run only. Add -ApplyReload to call /asterisk-config/reload."
  exit 0
}

Write-Host "Applying PBX reload..."
$reload = Invoke-RestMethod -Method Post -Uri "$base/api/v1/asterisk-config/reload" -Headers $headers -Body "{}" -ContentType "application/json"
if ($reload.error) {
  Write-Error ($reload.error | ConvertTo-Json -Depth 8)
  exit 3
}

Write-Host "Reload request accepted."
