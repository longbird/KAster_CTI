# C# 소프트폰 오디오 검증 (2026-08-20)

> 대상: `apps/desktop-win` 1단계. 설계 근거는 [`docs/design/2026-08-20-csharp-desktop-client-design.md`](../design/2026-08-20-csharp-desktop-client-design.md) 3장·10장,
> 절차는 [`docs/plans/2026-08-20-csharp-desktop-client-phase1-plan.md`](../plans/2026-08-20-csharp-desktop-client-phase1-plan.md) Task 11.

## 결론 (현재 시점)

**미디어 경로의 코드는 검증됐고, 실통화 음질은 아직 검증되지 않았다.** 개발 PC 에 재생 장치와 PBX 접근이 없어
에코 실측을 여기서 돌릴 수 없다. 아래 3번 절차를 상담원 PC 에서 그대로 돌려 채우면 1단계 종료 게이트가 닫힌다.

| 항목 | 상태 | 근거 |
|---|---|---|
| 통신용 역할 WASAPI 캡처가 열린다 | **확인** | 아래 1번 |
| alaw/ulaw 20ms 인코딩·디코딩 왕복 | **확인** | `AudioPacketizerTests` (자동 테스트) |
| 20ms 패킷 분할과 꼬리 이어붙이기 | **확인** | `AudioPacketizerTests` (자동 테스트) |
| 음소거가 같은 길이의 무음을 보낸다 | **확인** | `AudioPacketizerTests` (자동 테스트) |
| 장치 사라짐 → 기본 장치 대체 + 사용자 통지 | **확인** | `AudioDeviceControllerTests` (자동 테스트) |
| 실통화 양방향 음성 | **미검증** | PBX 미접속 |
| 스피커폰 에코 | **미검증** | 재생 장치 없음 |
| 왕복 지연 | **미검증** | 위와 같음 |

## 1. 장치 조사 결과 (개발 PC)

| 항목 | 값 |
|---|---|
| OS | Microsoft Windows NT 10.0.19045 (Windows 10 22H2) |
| 캡처 장치 | 스테레오 믹스 (Realtek High Definition Audio) — 믹스 형식 48kHz / 2ch / 32bit float |
| 재생 장치 | **없음** (활성 렌더 엔드포인트 0개) |
| 통신용 역할 기본 캡처 | 위와 같은 장치로 해석됨 |
| 통신용 모드 캡처 열기 | **성공** — 700ms 동안 11개 버퍼 수신 |

### 이 결과가 뜻하는 것

- **`IAcousticEchoCancellationControl` 로 AEC 지원 여부를 조회할 수 없다.** 이 API 는 Windows 11 22H2(빌드 22621) 이상에서만 제공되고
  이 PC 는 Windows 10 19045 다. Windows 10 에서도 드라이버가 제공하는 통화용 오디오 처리(APO)는 통신용 역할 스트림에 붙지만,
  **붙는지 여부가 드라이버마다 다르다.** 즉 조회가 아니라 **실측으로만 판정된다.**
- 개발 PC 에 재생 장치가 없어 **스피커폰 조건 자체를 만들 수 없다.** 실측은 상담원 PC 에서 해야 한다.

## 2. 코드에서 확정한 것

- 캡처는 `SIPSorceryMedia.Windows` 의 `WindowsAudioEndPoint` 를 쓰지 않는다. 그쪽은 NAudio `WaveInEvent`(winmm) 라
  에코 제거가 없고 WASAPI 장치 선택도 안 된다. 대신 `WasapiAudioEndPoint` 가 `IAudioSource`/`IAudioSink` 를 직접 구현한다.
- 기본 장치는 **멀티미디어 역할이 아니라 통신용 역할**로 고른다 (`WasapiDeviceEnumerator`). OS 의 통화용 처리를 타기 위한 전제다.
- 코덱은 PCMA(8) / PCMU(0) 8kHz 모노만 내놓는다. PBX 의 `allow=alaw,ulaw` 와 맞춘다.
- 패키지에서 `SIPSorceryMedia.Windows` 를 **뺐다.** 10.0.16 이 `net10.0-windows` 만 지원해 `net8.0-windows` 에 들어오지 않고,
  애초에 쓰지 않기로 한 컴포넌트다. 필요한 `IAudioSource`/`IAudioSink` 는 `SIPSorcery` 가 끌어오는
  `SIPSorceryMedia.Abstractions` 에 있다.

## 3. 남은 실측 절차 (상담원 PC 에서 수행)

귀로만 판단하지 않는다. 아래를 그대로 돌리고 이 문서의 표를 채운다.

1. **스피커폰 조건을 만든다** — 내장 마이크 + 내장 스피커, 볼륨 70%.
2. **PBX 양방향 녹취를 켠다** — `MixMonitor`. `recording-pipeline` 이 이미 스테레오 RAW 를 받는다.
3. **상담원 쪽에서 짧은 박수 3회 + 5초 발화**, 상대는 침묵.
4. **녹취 wav 의 상대 레그 채널 파형을 본다.** 상담원 음성이 되돌아와 있으면 에코다.
   박수 임펄스의 원본–반사 간격으로 왕복 지연을 잰다.
5. **헤드셋 조건(헤드셋 마이크 + 헤드셋 출력)으로 같은 절차를 돌려 비교한다.**

### 판정 기준

| 조건 | 합격선 |
|---|---|
| 헤드셋 — 에코 | 상대 레그에 상담원 음성이 들리지 않는다 |
| 헤드셋 — 왕복 지연 | 300ms 이하 |
| 스피커폰 — 에코 | 상대 레그의 반사 성분이 원음 대비 −25dB 이하 |
| 양쪽 — 끊김 | 5초 발화 중 무음 구간 없음 |

### 불합격 시 대응 순서

설계 문서 10장 그대로 올린다. **여기서 판단을 미루지 않는다.**

1. 헤드셋 전제로 범위를 좁힌다 (스피커폰 미지원을 명시)
2. WebRTC APM 을 P/Invoke 로 붙인다
3. 상용 SDK 를 검토한다

## 4. 함께 확인할 통화 기능

| 항목 | 방법 | 결과 |
|---|---|---|
| 내선 1001 ↔ 1002 양방향 음성 | 실통화 | 미검증 |
| 끊기가 양방향으로 동작 | 양쪽에서 각각 끊어 본다 | 미검증 |
| 마이크 끄기가 상대에게 반영 | 음소거 중 발화 → 상대 무음 확인 | 미검증 |
| SIP 등록 | PBX 에서 `asterisk -rx "pjsip show endpoint 1001"` → Contact 가 `Avail` | 미검증 |

### SIP 등록에 대해 여기서 확인한 것

PBX 없이도 우리가 내보내는 REGISTER 자체는 확인했다. 로컬 UDP 소켓을 PBX 자리에 두고 받은 실제 패킷:

```
REGISTER sip:pbx.local SIP/2.0
To: "김상담" <sip:1001@pbx.local>
From: "김상담" <sip:1001@pbx.local>;tag=...
Contact: "김상담" <sip:1001@127.0.0.1:62452>
User-Agent: sipsorcery_v10.0.16.0
```

AOR 은 SIP 도메인, 목적지는 `sipServer` 로 나뉘어 있고 Contact 는 실제 채널 종단으로 다시 쓰였다.
Asterisk PJSIP 가 기대하는 형태다. 남은 것은 **인증 응답(401 → 다이제스트 재전송)과 Contact 등록**이며 이건 실 PBX 가 있어야 한다.
