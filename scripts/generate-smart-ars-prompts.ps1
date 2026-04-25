param(
  [string]$OutputDir = "$PSScriptRoot\..\infra\asterisk\sounds\custom"
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Speech

$resolvedOutputDir = [System.IO.Path]::GetFullPath($OutputDir)
New-Item -ItemType Directory -Force -Path $resolvedOutputDir | Out-Null

$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$koVoice = $voice.GetInstalledVoices() |
  Where-Object { $_.VoiceInfo.Culture.Name -eq 'ko-KR' } |
  Select-Object -First 1

if ($koVoice) {
  $voice.SelectVoice($koVoice.VoiceInfo.Name)
}

$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
  8000,
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
  [System.Speech.AudioFormat.AudioChannel]::Mono
)

$prompts = @(
  @{
    Name = 'smart_ars_guide'
    Text = '스마트 에이알에스입니다. 상담원 연결은 0번, 문자 수신 거부는 1번, 이용 안내는 2번을 눌러 주세요.'
  },
  @{
    Name = 'smart_ars_invalid'
    Text = '잘못 누르셨습니다. 안내에 따라 다시 선택해 주세요.'
  },
  @{
    Name = 'smart_ars_fail'
    Text = '요청을 처리할 수 없습니다. 잠시 후 다시 이용해 주세요.'
  },
  @{
    Name = 'smart_ars_info'
    Text = '이용 안내입니다. 상담 연결과 문자 수신 거부는 스마트 에이알에스 메뉴에서 처리할 수 있습니다.'
  }
)

foreach ($prompt in $prompts) {
  $target = Join-Path $resolvedOutputDir "$($prompt.Name).wav"
  $voice.SetOutputToWaveFile($target, $format)
  $voice.Speak($prompt.Text)
  $voice.SetOutputToNull()
  Write-Host "generated $target"
}

$voice.Dispose()
