# C# 데스크톱 소프트폰 1단계 검증 (2026-08-20)

> 대상 브랜치 `feat/csharp-desktop-client`. 계획은 [`docs/plans/2026-08-20-csharp-desktop-client-phase1-plan.md`](../plans/2026-08-20-csharp-desktop-client-phase1-plan.md) Task 15,
> 오디오 실측은 [`2026-08-20-csharp-softphone-audio-verification.md`](2026-08-20-csharp-softphone-audio-verification.md) 로 분리했다.

## 결론

**코드 경로는 검증됐고, 실 PBX 시나리오는 아직 남았다.** 자동 테스트·빌드·서버 회귀는 전부 통과했고,
로그인부터 대기/수신/통화중 화면 전환까지는 스텁 서버로 **실제 앱을 띄워** 확인했다.
남은 것은 PBX 가 있어야만 할 수 있는 항목(등록·양방향 음성·에코)이다.

## 1. 자동 검증 (이번에 실행)

| 명령 | 결과 |
|---|---|
| `dotnet test apps/desktop-win/KAster.Desktop.sln` | **127개 전부 통과** (실패 0, 건너뜀 0) |
| `dotnet build apps/desktop-win/KAster.Desktop.sln -c Release` | **성공, 경고 0개** |
| `cd apps/server && npm test` | **71개 스위트 / 510개 테스트 전부 통과** |
| `cd apps/server && npm run lint` | **오류 0개** |

테스트가 덮는 범위:

| 영역 | 파일 |
|---|---|
| 응답 봉투·상태 코드 계약 | `Contracts/ApiEnvelopeTests` |
| 설정 저장·DPAPI 토큰 금고 | `Storage/*` |
| 로그인·401 단일 회전 | `Server/AuthClientTests`, `Server/TokenRefreshHandlerTests` |
| REST 명령 경로와 본문 | `Server/CtiServerClientTests` |
| 실시간 이벤트 파싱 | `Server/CtiEventParserTests` |
| 서버 우선 통화 상태 병합 | `State/CallStateStoreTests` |
| 재연결 백오프 | `Runtime/RetryPolicyTests` |
| SIP 옵션 해석 | `Softphone/SoftphoneOptionsTests` |
| 오디오 장치 선택·패킷 분할·코덱 왕복 | `Softphone/AudioDeviceControllerTests`, `AudioPacketizerTests`, `PcmConversionTests` |
| 창 모드 바운드 | `App/WindowBoundsTests` |
| 로그인·통화 화면 뷰모델 | `App/LoginViewModelTests`, `App/SoftphoneViewModelTests` |

## 2. 라이브 확인 (스텁 서버 + 실제 WPF 앱)

PBX 없이도 확인 가능한 구간은 스텁 서버(`POST /api/v1/auth/login` + Socket.IO `/ws`)를 세우고
**앱을 실제로 실행해** 창 크기와 화면을 캡처했다.

| 항목 | 확인 내용 |
|---|---|
| 로그인 요청 계약 | 서버가 받은 본문: `{"loginId":"agent1001","password":"...","extension":"1001","clientType":"desktop"}` — `clientType: desktop` 이 실려야 SIP credential 이 내려온다 |
| 버튼 활성 조건 | 세 칸이 다 차기 전에는 로그인 버튼 비활성, 다 차면 활성 |
| 창 모드 전환 | 대기 **440×560** → 수신 **440×420** → 통화중 **460×620** → 종료 후 대기 **440×560**. 계획서의 바운드 표와 일치 |
| 통화 시간 | 서버 `answeredAt` 기준. 6초 간격 캡처에서 `01:15` → `01:21` |
| 마이크 토글 | 버튼이 "마이크 끄기" ↔ "마이크 켜기" 로 바뀌고 명령이 서버로 나간다 |
| 스크롤 없음 | 통화중 화면을 **최소 크기(420×540)** 까지 줄여도 스크롤바가 생기지 않는다 |
| 긴 고객명 | 18자 고객명이 한 줄 안에서 끝난다 (`TextTrimming="CharacterEllipsis"`) |
| 예외 | `%LOCALAPPDATA%\KAsterCti\error.log` 에 기록 없음 |

### 이 과정에서 잡은 결함 하나

**증상**: 수신(ringing)까지는 화면이 바뀌는데 통화중(talking)에서 멈췄다. 예외도, 로그도 없었다.

**원인**: 서버 이벤트를 소켓 스레드에서 그대로 뷰모델에 적용했다. 수신 화면이 뜬 뒤부터는 버튼이
`ICommand.CanExecuteChanged` 를 구독하는데, WPF 는 그 이벤트를 **UI 스레드 밖에서 올리는 것을 거부한다.**
그 예외가 소켓 라이브러리 안에서 조용히 삼켜져 뒤따르는 창 모드 전환이 실행되지 않았다.

**수정**: 두 가지를 같이 고쳤다.
1. `SoftphoneRuntime` 이 `Action<Action> post` 를 받아 **서버 이벤트를 UI 스레드에서 적용**한다.
   이후의 상태 저장소·뷰모델·창 조작이 전부 한 스레드에서 돈다.
2. `CtiEventClient` 가 구독자 예외를 `HandlerFailed` 로 밖에 내보낸다. 라이브러리가 삼키면
   "이벤트는 오는데 화면이 안 바뀐다" 가 되어 원인 추적이 불가능해진다.

**남은 한계**: 이 결함의 자동 회귀 테스트는 없다. WPF 의 스레드 친화성 거부는 실제 창과 바인딩이 있어야
재현되고, 뷰모델 단위 테스트로는 잡히지 않는다. 위의 라이브 절차(수신 → 통화중 전환 확인)가 현재의 회귀 확인 수단이다.

## 3. 남은 실 PBX 시나리오 (미실행)

이 환경에는 PBX 접근이 없다. 아래는 상담원 PC + 실 PBX 에서 그대로 돌린다.
**실행하지 않은 항목을 통과로 적지 않는다.**

| # | 시나리오 | 상태 |
|---|---|---|
| 1 | 로그인 → SIP 등록 (`pjsip show endpoint 1001` 의 Contact 가 `Avail`) | 미실행 |
| 2 | 외부 → 큐 → 이 상담원 수신, 화면이 ringing 으로 전환 | 미실행 |
| 3 | 받기 → talking, 양방향 음성 | 미실행 |
| 4 | 마이크 끄기 → 상대가 못 들음, 다시 켜기 | 미실행 |
| 5 | 끊기 → 양쪽 종료, 화면이 idle 로 복귀 | 미실행 |
| 6 | 발신 → 상대 단말이 울리고 통화됨 | 미실행 |
| 7 | 상태 변경(대기 ↔ 휴식) 이 관리자 화면에 반영 | 미실행 |
| 8 | 서버를 내렸다 올렸을 때 재연결 | 미실행 (백오프 코드와 끊김 감지는 붙어 있음) |
| 9 | 액세스 토큰 만료(15분) 후 자동 회전 | 미실행 (단일 회전 로직은 단위 테스트로 검증됨) |

부분 확인된 것: REGISTER 요청의 형태는 로컬 UDP 소켓을 PBX 자리에 두고 확인했다
(AOR `sip:1001@pbx.local`, Contact 는 실제 채널 종단으로 재작성). 인증 응답(401 → 다이제스트)과
등록 성립은 실 PBX 가 있어야 한다. 상세는 오디오 검증 문서 4장.

## 4. 1단계 종료 게이트

**아직 닫히지 않았다.** 종료 조건은 두 가지다.

1. 위 3장의 9개 시나리오 통과
2. 오디오 검증 문서 3장의 에코 실측 판정

에코가 스피커폰에서 남으면 설계 문서 10장의 순서(헤드셋 전제 축소 → WebRTC APM → 상용 SDK)로 올리고,
결정 전에는 2단계로 넘어가지 않는다.

## 5. 서버 쪽 변경 사항

`SOFTPHONE_SIP_SERVER` / `SOFTPHONE_SIP_TRANSPORT` 를 추가했다. **추가만 했다** — `wsServer` 는 그대로라
상담원 웹앱과 기존 Electron 앱은 영향이 없다. 활성 판정만 "WS 또는 SIP 주소 중 하나라도 있으면 활성"으로 넓혔다.
회귀는 `auth-softphone-config.integration.spec.ts` 와 `auth-desktop-session.integration.spec.ts` 가 덮는다.
