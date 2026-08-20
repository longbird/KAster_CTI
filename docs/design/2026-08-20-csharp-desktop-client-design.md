# C# 데스크톱 클라이언트 설계

작성일: 2026-08-20
대상: `apps/desktop/` (Electron 33 + React 19 + sip.js, 비테스트 45파일 / 약 9,359줄) 를 대체할 신규 `apps/desktop-win/`
관련 문서: [`2026-04-22-agent-desktop-architecture-design.md`](2026-04-22-agent-desktop-architecture-design.md),
[`agent-desktop-update-api.md`](agent-desktop-update-api.md),
[`agent-desktop-internal-code-signing.md`](agent-desktop-internal-code-signing.md),
[`cti-event-contract.md`](cti-event-contract.md)

---

## 1. 배경과 목표

상담원 데스크톱 소프트폰을 C#/.NET 8 네이티브 앱으로 재구현한다. 동기는 세 가지다.

1. **배포·용량·메모리** — Electron 런타임(150MB+)과 Chromium 메모리 사용을 걷어낸다.
2. **음성 품질·오디오 제어** — 브라우저 WebRTC 로는 부족한 장치 선택·볼륨·헤드셋 제어를 OS API 로 직접 다룬다.
3. **안정성·유지보수** — main/renderer/preload 3층 IPC 를 단일 프로세스 타입 안전 코드로 줄인다.

비목표: 크로스플랫폼(Windows 전용), 관리자 대시보드(`apps/admin`)·상담원 웹앱(`apps/web`) 대체.

### 채택한 선택

| 항목 | 결정 | 탈락안과 이유 |
|---|---|---|
| SIP/미디어 스택 | **SIPSorcery 10.x** (순수 C#, .NET 8 타깃, BSD 3-Clause + 추가 사용제한) | PJSIP P/Invoke — 네이티브 빌드·마샬링 복잡도와 GPLv2/상용 라이선스. 상용 SDK — 좌석당 비용·블랙박스 |
| UI | **WPF (.NET 8, MVVM)** | WinUI 3 — 비정형 창·투명도 제어 제약과 패키징 복잡도. Avalonia — 크로스플랫폼이 불필요. WinForms — 현재 UI 수준 재현 비용 |
| 프로세스 구조 | **단일 프로세스** | UI/미디어 2프로세스 분리 — 지금 Electron 의 main/renderer 분리를 재생산해 단순화 동기와 충돌 |
| PBX 연결 | **SIP UDP 직결 + 평문 RTP** | SIP-over-WSS + WebRTC 유지 — TURN 의존과 추가 지연이 남음 |
| 기존 앱 | **병행 유지 → 현장 검증 후 교체** | 즉시 대체 — 롤백 경로가 사라짐 |

코덱은 PBX 설정(`infra/asterisk/pjsip.conf` 의 `allow=alaw,ulaw`)에 맞춰 **PCMA/PCMU 만** 협상한다.
에이전트 엔드포인트에 `transport=` 지정이 없어 기본 `transport-udp`(0.0.0.0:48950) 로 그대로 등록된다.

---

## 2. 솔루션 구조

```
apps/desktop-win/
  KAster.Desktop.sln
  src/
    KAster.Desktop.Core/        net8.0          도메인·서버 클라이언트·상태·저장소 (UI/SIP 의존 없음)
    KAster.Desktop.Softphone/   net8.0-windows  SIPSorcery 등록·통화·RTP·WASAPI 오디오
    KAster.Desktop.App/         net8.0-windows  WPF 화면·창모드·트레이·팝업·핫키
  tests/
    KAster.Desktop.Tests/       net8.0-windows  xUnit
```

경계는 현재 main/renderer 분리와 같되 프로세스는 하나다. 의존 방향은 `App → Softphone → Core` 단방향이며
`Core` 는 어느 쪽도 참조하지 않는다. 파일은 200~400줄을 기준으로 나누고, 한 클래스가 한 가지 책임만 갖는다.

### Electron → C# 매핑

| 현재 (`apps/desktop/src/`) | 신규 | 비고 |
|---|---|---|
| `main/cti-runtime.ts` | `Core/Server/CtiServerClient` | REST + Socket.IO |
| `main/auth-client.ts` | `Core/Server/AuthClient` | 로그인·리프레시·핸드오프 교환 |
| `main/token-vault.ts` | `Core/Storage/TokenVault` | DPAPI 암호화 |
| `main/config-store.ts`, `*-preferences-store.ts` | `Core/Storage/JsonSettingsStore<T>` | `%APPDATA%\KAsterCTI\*.json` |
| `main/runtime-supervisor.ts` | `Core/Runtime/RuntimeSupervisor` | 백오프 재연결·헬스체크 |
| `main/protocol-payload.ts` | `Core/Protocol/ProtocolPayloadParser` | `kastercti://` 파싱 |
| `main/desktop-bridge-server.ts` | `Core/Bridge/DesktopBridgeServer` | `HttpListener` |
| `main/update-client.ts` | `Core/Update/UpdateService` | 서버 `agent-updates` 매니페스트 계약 유지 |
| `main/tray-service.ts`, `attention-service.ts` | `App/Services/TrayService`, `AttentionService` | NotifyIcon·창 플래시·토스트 |
| `main/index.ts` 의 창 크기/위치 로직 | `App/Services/WindowModeService` | 창 형상의 단일 진실원 |
| `renderer/src/store/useDesktopStore.ts` | `Core/State/AppState` + `App/ViewModels/*` | 순수 상태 전이는 Core |
| `renderer/src/softphone/sip-softphone-client.ts` | `Softphone/SipSoftphoneClient` | SIPSorcery |
| `renderer/src/audio/audio-device-controller.ts` | `Softphone/Audio/AudioDeviceController` | WASAPI |
| `shared/cti.ts`, `shared/ipc.ts` | `Core/Contracts/*.cs` | IPC 부분은 소멸, 도메인 타입만 이식 |

`shared/ipc.ts` 의 `DesktopApi` 60여 개 메서드는 IPC 경계가 사라지므로 그대로 옮기지 않는다.
서버 호출은 `CtiServerClient`, 창 제어는 `WindowModeService`, 나머지는 ViewModel 내부 호출이 된다.

---

## 3. 소프트폰

### 등록과 통화

- `SIPTransport` 에 UDP 채널 1개. 로컬 포트는 OS 할당.
- `SIPRegistrationUserAgent` 로 등록하고 만료 전 자동 갱신. 실패는 지수 백오프로 재시도하며 UI 에 등록 상태를 노출한다.
- 수·발신은 `SIPUserAgent`. 수신 INVITE 는 즉시 180 Ring, 사용자가 받으면 200 OK.
- 미디어는 `VoIPMediaSession` + **자체 오디오 엔드포인트**(아래). 오디오 포맷은 PCMA/PCMU 로 제한한다.
- DTMF 는 RFC2833(`SendDtmf`).

### 오디오 — 자체 WASAPI 엔드포인트를 만든다

`SIPSorceryMedia.Windows` 가 제공하는 `WindowsAudioEndPoint` 를 **쓰지 않는다.** 2026-08-20 소스 확인 결과
마이크 캡처가 NAudio `WaveInEvent`(winmm 레거시 API)이며 에코 제거·자동이득·잡음억제가 전혀 없다.
이 구현으로는 이 프로젝트의 두 가지 요구를 모두 못 채운다.

1. **장치 제어** — winmm 장치 인덱스라 입력/출력/벨소리 장치를 WASAPI 단위로 나눠 잡을 수 없다.
2. **에코 제거** — 처리 단계 자체가 없다.

대신 `IAudioSource` / `IAudioSink`(이벤트 몇 개짜리 작은 인터페이스)를 직접 구현한다. 캡처는 NAudio `WasapiCapture` 를
**통신용(communications) 모드**로 열어 OS 엔드포인트 효과(AEC 포함)를 태우고, 재생은 `WasapiOut` 을 쓴다.
Windows 11 22H2 이상에서는 `IAcousticEchoCancellationControl` 로 해당 캡처 장치의 AEC 지원 여부를 조회할 수 있다.

입력·출력·링백 장치를 각각 선택한다(링백을 스피커로 따로 보낼 수 있어야 함). 장치 핫플러그를 감지해
사라진 장치는 기본 장치로 폴백하고 사용자에게 알린다. 볼륨·마이크 뮤트는 앱 로컬 제어이며,
서버 `mute` API 호출과는 별개로 동작한다(현재 앱과 동일 — 서버 뮤트는 PBX 측 제어).

OS AEC 로 부족하면 대응 순서는 (1) 헤드셋 전제 운영으로 범위 축소, (2) WebRTC APM(`webrtc-audio-processing`) P/Invoke,
(3) 상용 SDK 재검토다. 판단은 1단계 실측 결과로 한다(10장).

### 서버 계약 확장

`DesktopSoftphoneConfig` 에 두 필드를 추가한다. 기존 `wsServer`/`iceServers` 는 웹 경로용으로 유지해 하위호환을 지킨다.

```
sipServer : string | null   // "pbx.example.com:48950"
transport : "udp" | "tls"   // 기본 "udp"
```

서버 변경 지점: `apps/server/src/modules/auth/auth.service.ts` 의 소프트폰 설정 생성부와
`.env.example`(`SOFTPHONE_SIP_SERVER`, `SOFTPHONE_SIP_TRANSPORT`), `npm run openapi:export`.

---

## 4. 서버 연동과 상태 동기화

### REST

`{baseUrl}/api/v1`, `Authorization: Bearer`. 401 응답이면 `/auth/refresh` 로 **1회** 토큰 쌍을 회전한 뒤 원요청을 재시도하고,
재차 실패하면 로그인 화면으로 보낸다(`apps/web/src/api/apiClient.ts` 와 같은 규칙).
모든 응답은 `{ success, data, error }` envelope 이므로 `ApiEnvelope<T>` 로 역직렬화한다.

### WebSocket

서버는 `@nestjs/platform-socket.io` 10.x / `socket.io` 4.x 이므로 **Engine.IO v4** 프로토콜이다.
.NET 측은 `SocketIOClient` 를 쓰고, 네임스페이스 `/ws`, 핸드셰이크 `auth: { token }` 으로 붙는다.
구독 이벤트는 `call.created`, `call.updated`, `call.ended`, `screenpop.customer`,
`agent.status.changed`, `queue.summary.updated`, `announcement.pushed` 7종 + 연결 상태 변화.

### 진실원 규칙

통화의 **상태·`callId`·고객 정보는 서버 이벤트가 진실원**이고, SIP 다이얼로그는 **미디어 제어 전용**이다.
로컬 SIP 상태가 서버 상태를 덮어쓰지 않는다. 수신 INVITE 와 `call.created` 의 결합은
현재 `useDesktopStore` 의 매칭 규칙을 그대로 이식하며, 1단계에서 실 PBX 로 검증한다.

---

## 5. UI

### 시각 방향 — A안 정제판 (채택 2026-08-20)

세 방향(A 정제판 / B 포커스판 / C 다크 콘솔)을 통화중 화면으로 비교해 **A안**을 채택했다.
현재 앱의 토큰을 그대로 계승하고 계층과 간격만 정리하는 방향이라 상담원 재교육 부담과 이행 위험이 가장 낮다.
B안(번호 34px·원형 액션·넓은 여백)은 가독성이 가장 좋았으나 620px 안에서 부가 정보가 팝업으로 밀렸고,
C안(야간용 다크)은 관리자 화면·상담원 웹앱이 라이트라 제품 전체의 톤이 갈리는 문제로 보류했다.

계승하는 토큰(출처: `apps/desktop/src/renderer/src/styles.css`):

| 항목 | 값 |
|---|---|
| 글꼴 | `"Segoe UI", "Malgun Gothic", sans-serif` |
| 배경 / 서피스 / 보조 서피스 | `#eef3f7` / `#ffffff` / `#f6f8fa` |
| 테두리 / 강조 테두리 | `#cbd5df` / `#9ba8b6` |
| 본문 / 보조 텍스트 | `#17202a` / `#64748b` |
| 주색 / 진한 주색 | `#216e9f` / `#14557d` |
| 위험 / 정상 / 주의 | `#ba2f36` / `#1f7a4c` / `#a16207` |
| 반경 | 패널 8px, 입력·버튼 4px, 칩 999px |
| 그림자 | `0 10px 28px rgba(15, 23, 42, 0.14)` |

화면 시안(창 모드 5종 + 설정 + 팝업 3종)은 디자인 캔버스에 있다:
<https://claude.ai/code/artifact/362ae6cf-f98b-4094-815c-d8556ce3c670>

### 창 모드

`compact`/`full`/`idle`/`ringing`/`talking`/`transferring`/`afterCall`/`settings` 8개를 유지한다.
크기·위치·투명도·항상위의 단일 진실원은 `WindowModeService` 다 — 현재 Electron main 프로세스의 역할을 그대로 옮긴다.
ViewModel 은 모드 전환을 *요청*만 하고 창을 직접 조작하지 않는다. 모드별 바운드 계산은 순수 함수로 분리해 테스트한다.

### 레이아웃 규칙 — 창에 스크롤을 만들지 않는다

네이티브 앱이므로 창 전체가 스크롤되는 화면은 만들지 않는다. 웹앱의 신호이지 데스크톱 앱의 신호가 아니다.

1. 모든 화면은 그 모드의 창 크기 안에서 끝난다. 내용이 넘치면 스크롤이 아니라 **창 모드를 바꾸거나 팝업으로 뗀다**.
2. 고객명·회사명·전화번호 같은 가변 텍스트는 **한 줄 고정 + 말줄임**. 줄바꿈으로 아래 요소를 밀어내지 않는다.
3. 메모처럼 길어지는 본문은 **고정 줄 수까지만** 보이고 전체는 별도 창에서 본다.
4. 남는 세로 공간은 **한 영역만** 흡수한다. 여러 영역이 함께 늘어나면 합계가 창을 넘긴다.

**예외 — 목록 영역**: 통화이력·상담원 목록처럼 항목 수가 가변인 팝업은 머리말·검색·버튼을 고정하고
**가운데 리스트 상자만** 스크롤한다(Windows 탐색기·Outlook 과 같은 네이티브 패턴). 창 자체는 여전히 스크롤하지 않는다.

### 팝업과 입력

통화이력·상담원목록·다이얼패드는 별도 `Window`. 전환 단축키는 `RegisterHotKey` 전역 훅으로 등록하고,
중복 등록·충돌은 설정 화면에서 알린다. 앱은 단일 인스턴스로 강제하며, 두 번째 실행은
`kastercti://` 페이로드를 named pipe 로 첫 인스턴스에 전달하고 종료한다.

---

## 6. 보안과 저장

- **토큰**: 액세스·리프레시 토큰을 DPAPI(`ProtectedData`, `CurrentUser`)로 암호화해 `%APPDATA%\KAsterCTI\` 에 저장한다.
- **SIP 비밀번호**: 디스크에 쓰지 않는다. 로그인 시 서버가 내려주는 값을 메모리에서만 보관하고 종료 시 폐기한다.
- **설정**: 서버 URL·오디오·통화·일반 환경설정은 평문 JSON. 민감값을 넣지 않는다.
- **로그**: 진단 로그에 토큰·비밀번호·전체 전화번호를 남기지 않는다.
- **입력 검증**: 서버 응답과 `kastercti://` 페이로드는 경계에서 검증한다(필수 필드·형식·URL 스킴 허용목록).

---

## 7. 테스트 전략

TDD 로 진행한다. `Core` 와 `Softphone` 의 순수 로직은 테스트를 먼저 쓴다.

| 대상 | 방식 |
|---|---|
| 통화 상태 전이, 서버/SIP 이벤트 병합 | xUnit 단위 테스트 |
| 재연결 백오프, 토큰 회전, envelope 파싱 | xUnit + 가짜 HTTP 핸들러 |
| `kastercti://` 파싱, 창 모드 바운드 계산 | xUnit 순수 함수 테스트 |
| SIP 등록·INVITE·BYE 시나리오 | SIPSorcery 루프백(로컬 UA 2개) 통합 테스트 |
| 오디오 장치 선택·폴백 | 인터페이스 추상화 + 가짜 장치 목록 |
| 실제 통화 품질·에코 | `docs/qa/` 의 기존 PBX 스모크 절차 준용, 실측 결과를 `docs/qa/` 에 별도 문서로 기록 |

목표 커버리지는 `Core` 80% 이상. UI(XAML) 코드비하인드는 로직을 두지 않아 테스트 대상에서 제외한다.

---

## 8. 배포

`win-x64` self-contained single-file + ReadyToRun 으로 게시한다.
자동 업데이트는 서버 `agent-updates` 모듈의 기존 매니페스트 계약과 내부 코드서명 스크립트를 그대로 재사용해
현재 Electron 앱과 같은 경로로 배포한다. 두 앱이 병행하는 기간에는 채널을 분리해 서로의 업데이트를 덮지 않게 한다.

---

## 9. 단계

| 단계 | 범위 | 종료 조건 |
|---|---|---|
| 1 | 로그인·핸드오프, SIP 등록, 수신·발신·끊기·뮤트, 상태 변경, WS 이벤트 수신, `idle`/`ringing`/`talking` 창 모드 | 실 PBX 에서 양방향 통화 성공 + **음질 게이트 통과** |
| 2 | 전환(blind/attended), 홀드/재개, 다이얼패드, 통화이력, 상담원 목록, 메모, 스크린팝 | 기존 앱과 기능 동등성 확인 |
| 3 | 트레이·알림, 전역 핫키, 자동 업데이트, `kastercti://`, 데스크톱 브리지, 진단 로그 | 현장 파일럿 배포 |

Electron 앱은 3단계 현장 검증이 끝날 때까지 유지한다.

---

## 10. 리스크

| 리스크 | 영향 | 대응 |
|---|---|---|
| **SIPSorcery 에 에코 제거(AEC)가 없음 — 확인 완료** | 스피커폰 사용 시 상대가 자기 목소리를 들음 | 자체 WASAPI 오디오 엔드포인트를 통신용 모드로 열어 OS AEC 를 태운다(3장). 헤드셋에서 깨끗한지, 스피커폰에서 잔여 에코가 있는지 1단계에서 실측하고 결과를 `docs/qa/` 에 남긴다 — **1단계 종료 게이트** |
| Socket.IO v4(EIO4) .NET 클라이언트 호환성 | 이벤트 수신 불가 | 1단계 첫 스파이크에서 핸드셰이크·이벤트 수신을 먼저 검증 |
| 서버 세션 ↔ SIP 다이얼로그 매칭 오류 | 잘못된 통화에 제어 적용 | 서버 우선 원칙 + 실 PBX 검증. 매칭 실패 시 미디어 제어만 로컬 처리하고 UI 상태는 서버를 따른다 |
| UDP 직결 시 NAT·방화벽 | 원격 상담원 등록 실패 | 사내망 전제로 시작. 원격은 TLS+SRTP 를 2단계 이후 검토 |
| 두 클라이언트 병행 기간의 계약 드리프트 | 한쪽만 깨짐 | 서버 계약 변경은 추가(additive)만 허용. `wsServer` 제거 금지 |

---

## 11. 미결정 사항

- 원격 상담원용 TLS+SRTP 지원 여부와 시점 (2단계 이후 판단)
- 병행 기간 업데이트 채널 명명 규칙
- Electron 앱 폐기 시점과 그 시점의 마이그레이션 안내 절차
