# 상황별 안내 멘트 생성. Windows 음성엔진(Heami, ko-KR) → 8kHz/16bit/mono WAV.
# Asterisk 가 그대로 재생하는 형식이라 변환이 필요 없다.
Add-Type -AssemblyName System.Speech

$outDir = $args[0]
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# 말이 느리면 듣는 사람이 지친다. 너무 빠르면 번호를 못 받아 적는다. +2 가 그 사이다.
$rate = 2

$prompts = @(
  @{ f = 'smart_ars_guide';       t = '안녕하세요. 고객센터입니다. 상담원 연결은 영번, 수신 거부 등록은 일번, 이용 안내는 이번을 눌러 주세요.' }
  @{ f = 'smart_ars_invalid';     t = '잘못 누르셨습니다. 다시 선택해 주세요.' }
  @{ f = 'smart_ars_fail';        t = '선택이 확인되지 않았습니다. 통화를 종료합니다. 다시 걸어 주시기 바랍니다.' }
  @{ f = 'smart_ars_info';        t = '본 번호는 상담 전용 번호입니다. 상담 가능 시간은 평일 오전 아홉 시부터 오후 여섯 시까지입니다. 이용해 주셔서 감사합니다.' }
  @{ f = 'queue_connecting';      t = '상담원을 연결해 드리겠습니다. 잠시만 기다려 주십시오.' }
  @{ f = 'queue_timeout';         t = '지금은 모든 상담원이 통화 중입니다. 잠시 후 다시 걸어 주시기 바랍니다.' }
  @{ f = 'blocked_ani';           t = '고객님의 번호는 수신 거부로 등록되어 있습니다. 해제를 원하시면 상담 시간에 다시 연락해 주시기 바랍니다.' }
  @{ f = 'smart080_guide';        t = '광고 전화 수신 거부 등록 서비스입니다.' }
  @{ f = 'smart080_input';        t = '전화를 받으셨던 발신번호를 누르신 후, 우물 정자를 눌러 주세요.' }
  @{ f = 'smart080_reentry';      t = '발신번호를 다시 눌러 주신 후, 우물 정자를 눌러 주세요.' }
  @{ f = 'smart080_confirm_menu'; t = '등록하시려면 일번, 번호를 다시 입력하시려면 이번, 종료하시려면 구번을 눌러 주세요.' }
  @{ f = 'smart080_same_number';  t = '지금 걸고 계신 번호입니다. 전화를 받으셨던 발신번호를 눌러 주세요.' }
  @{ f = 'smart080_confirmed';    t = '수신 거부 등록이 완료되었습니다. 이용해 주셔서 감사합니다.' }
  @{ f = 'optout_failed';         t = '수신 거부 등록에 실패했습니다. 잠시 후 다시 시도해 주시기 바랍니다.' }
)

foreach ($p in $prompts) {
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SelectVoice('Microsoft Heami')
  $s.Rate = $rate
  $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
    8000,
    [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
    [System.Speech.AudioFormat.AudioChannel]::Mono)
  $path = Join-Path $outDir ($p.f + '.wav')
  $s.SetOutputToWaveFile($path, $fmt)
  $s.Speak($p.t)
  $s.SetOutputToNull()
  $s.Dispose()

  $len = (Get-Item $path).Length
  '{0,-24} {1,7} bytes  {2,5:N1}초' -f $p.f, $len, (($len - 46) / 16000)
}
