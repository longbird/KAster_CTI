# C# 상담원 클라이언트 기능 공백 분석 (2026-08-21)

> 대상 `apps/desktop-win`. 설계는 [`2026-08-20-csharp-desktop-client-design.md`](../design/2026-08-20-csharp-desktop-client-design.md),
> 1단계 계획은 [`2026-08-20-csharp-desktop-client-phase1-plan.md`](2026-08-20-csharp-desktop-client-phase1-plan.md).

## 결론

**1단계 범위 안에서만 6건이 빠져 있다.** 그중 3건은 화면에 자리가 있는데 동작하지 않거나
(메모), 서버가 보내는 것을 화면이 버리고 있는 것(상태 변경 이벤트, 스크린팝)이라 사용자 눈에는
"만들다 만 기능"으로 보인다. 나머지는 설계서가 2·3단계로 미뤄 둔 항목이다.

| 묶음 | 건수 | 성격 |
|---|---|---|
| **1단계인데 빠진 것** | 6 | 지금 고쳐야 함 |
| 2단계 (설계서 명시) | 6 | 기능 동등성 |
| 3단계 (설계서 명시) | 5 | 현장 배포 |
| 환경설정 | 4 | 운영 편의 |

## 무엇을 기준으로 삼았나

`REQUIREMENTS.md` 는 인덱스 문서라 기능 목록이 없다. 그래서 세 가지를 기준으로 잡았다.

1. **기존 Electron 앱의 IPC 계약** (`apps/desktop/src/shared/ipc.ts`) — 이 클라이언트가 대체하려는
   대상의 실제 기능 전수. 가장 구체적인 요구사항 원천이다.
2. **설계 문서 9장의 단계 표** — 무엇이 1·2·3단계인지의 공식 기준.
3. **서버가 이미 제공하는 API 와 이벤트** — 클라이언트가 안 쓰고 있는 것이 곧 공백이다.

## 지금 클라이언트가 하는 일

| 영역 | 상태 |
|---|---|
| 로그인 / 아이디·내선 저장 | 됨 |
| SIP 등록 + OPTIONS 응답 | 됨 |
| 수신 → 받기 / 거절 | 됨 |
| 발신 (내선·외부, 발신번호 선택, 자동응답) | 됨 |
| 끊기 | 됨 |
| 마이크 끄기 | 됨 |
| 상태 변경 (대기 ↔ 이석) | 됨 |
| WS 재연결 · 토큰 회전 | 됨 |
| 창 모드 idle / ringing / talking | 됨 |
| 전화번호 표시 형식 | 됨 |
| 서버 연결 / SIP 등록 상태 표시 | 됨 |

호출하는 서버 API 는 9개다: `auth/login`, `auth/refresh`, `me/session`, `me/call-capabilities`,
`agents`, `calls/active`, `calls/originate/internal`, `client/call-commands/originate`,
`calls/{id}/mute`, `calls/{id}/hangup`.

---

## A. 1단계인데 빠진 것

### A-1. 통화 메모가 저장되지 않는다

통화중 화면에 **메모 입력칸이 있는데 어디에도 연결돼 있지 않다.** 상담원이 통화 중에 적은 내용이
통화가 끝나면 사라진다. 화면에 칸이 있으니 저장되는 줄 알 수밖에 없다.

- 서버: `POST /calls/{callId}/memo` (이미 있음)
- 판단거리: 저장 시점 — 입력할 때마다인지, 통화 종료 시인지, 버튼인지

### A-2. 로그아웃이 없다

앱을 끄는 것 말고 로그아웃할 방법이 없다. 교대 근무에서 다음 상담원이 앞사람 계정으로 앉는다.

- 서버: `POST /auth/logout`, `POST /auth/logout-all` (이미 있음)
- 클라이언트에 `AuthClient.LogoutAsync` 래퍼가 없다

### A-3. 서버가 보내는 이벤트를 화면이 버린다

`CtiEventParser` 는 7종을 파싱하는데 `CallStateStore.Apply` 는 통화 3종만 쓴다. 나머지는 조용히 사라진다.

| 이벤트 | 지금 | 있어야 하는 동작 |
|---|---|---|
| `agent.status.changed` | 버려짐 | **관리자가 상태를 바꿔도 화면이 그대로다.** 강제 이석이 반영되지 않는다 |
| `screenpop.customer` | 버려짐 | 고객 정보가 통화 화면에 떠야 한다 |
| `announcement.pushed` | 버려짐 | 공지가 상담원에게 안 보인다 |
| `queue.summary.updated` | 버려짐 | 대기 건수 표시 |

앞의 두 개는 1단계 성격이다. 특히 `agent.status.changed` 는 **상태 변경이 단방향**이라는 뜻이고,
이건 관리 기능의 전제를 깬다.

### A-4. 오디오 장치를 고를 수 없다

`AudioDeviceController` / `WasapiDeviceEnumerator` 는 만들어져 있고 테스트도 있는데 **화면이 없다.**
헤드셋이 여러 개거나 기본 장치가 다른 PC 에서는 통화가 엉뚱한 장치로 나간다.
1단계 계획서 Task 11 의 장치 선택 요구를 절반만 채운 상태다.

### A-5. 당겨받기(pickup)

옆자리에 울리는 전화를 받을 수 없다. 콜센터에서 기본 동작이다.

- 서버: `POST /calls/{callId}/pickup` (이미 있음. `answer` 도 실제로는 이 경로다)

### A-6. 서버 주소를 화면에서 바꿀 수 없다

`%LOCALAPPDATA%\KAsterCti\settings.json` 을 직접 편집해야 한다. 현장 설치 때 상담원이 할 수 없다.

---

## B. 2단계 (설계서가 명시한 범위)

| # | 기능 | 서버 API | 비고 |
|---|---|---|---|
| B-1 | 호 전환 — blind | `POST /calls/{id}/transfer` | 있음 |
| B-2 | 호 전환 — attended (협의 후 연결/취소) | `.../transfer/attended/complete`, `.../cancel`, `/consultation`, `/transfer-call` | 있음 |
| B-3 | 홀드 / 재개 | `POST /calls/{id}/hold`, `/resume` | **서버가 feature code opt-in.** `ASTERISK_HOLD_FEATURE_CODE` 가 비면 API 도 비활성 — 현장 설정 확인 필요 |
| B-4 | 다이얼패드 (발신 + 통화중 DTMF) | 발신은 기존 경로, DTMF 는 SIP INFO/RFC2833 | 클라이언트 자체 구현 필요 |
| B-5 | 통화 이력 | `GET /calls/history`, `GET /agents/{id}/history` | 있음 |
| B-6 | 상담원 목록 | `GET /agents` | **이미 받아오고 있다** (내선 판별용). 화면만 없다 |

### 고객 정보 (스크린팝의 뒷면)

`GET /customers/search`, `GET /customers/{id}`, `GET /customers/{id}/history` 가 있다.
A-3 의 스크린팝과 짝이므로 함께 설계해야 한다.

---

## C. 3단계 (설계서가 명시한 범위)

| # | 기능 | 비고 |
|---|---|---|
| C-1 | 트레이 아이콘 · 수신 알림 | 창이 가려져 있으면 전화를 놓친다 |
| C-2 | 전역 핫키 | Electron 은 전환 핫키도 별도 저장 |
| C-3 | 자동 업데이트 | 서버에 `agent-updates` 모듈이 이미 있다 |
| C-4 | `kastercti://` 프로토콜 + 데스크톱 브리지 | 웹앱에서 세션 넘기기. `POST /auth/handoff/exchange` |
| C-5 | 진단 로그 | **일부 착수** — `call.log` 로 발신 흐름은 남기고 있다 |

---

## D. 환경설정 (Electron 에는 있고 여기엔 없는 것)

| # | 항목 | Electron IPC |
|---|---|---|
| D-1 | 오디오 환경설정 | `getAudioPreferences` / `saveAudioPreferences` (A-4 와 같은 건) |
| D-2 | 통화 환경설정 | `getCallPreferences` / `saveCallPreferences` |
| D-3 | 일반 환경설정 | `getGeneralPreferences` / `saveGeneralPreferences` |
| D-4 | 전환 핫키 | `getTransferHotkeys` / `saveTransferHotkeys` |

---

## 권고 순서

**설계서의 단계를 그대로 따르되, A 는 단계와 무관하게 먼저 처리한다.**
A 는 새 기능이 아니라 *만들다 만 것*이라 사용자가 결함으로 인식한다.

1. **A-1 메모**, **A-3 상태 이벤트 반영**, **A-2 로그아웃** — 각각 작다. 하루 안쪽
2. **A-4 오디오 장치 선택**, **A-6 서버 주소 설정** — 설정 화면 하나로 묶는 게 자연스럽다
3. **A-5 당겨받기** — 서버 계약이 이미 맞아 있다
4. B-6 상담원 목록 → B-1/B-2 전환 (상담원 목록이 전환 대상 선택 화면이 된다)
5. B-5 통화 이력, B-4 다이얼패드
6. B-3 홀드 — **현장 feature code 설정을 먼저 확인**한다. 안 열려 있으면 API 도 안 열린다
7. A-3 스크린팝 + 고객 정보 (C 의 알림과 함께 설계)
8. C 전체

## 이 문서가 답하지 않는 것

- **화면 배치.** 기능이 늘면 440×560 창에 다 들어가지 않는다. 설계서의
  "창에 스크롤을 만들지 않는다" 제약과 충돌하므로, 탭·팝업·창 확장 중 무엇을 쓸지 결정이 필요하다.
  Electron 은 팝업 창(`openCallHistoryPopup`, `openAgentListPopup`, `openDialpadPopup`)을 썼다.
- **우선순위의 최종 결정.** 위 순서는 의존성과 크기 기준이고, 현장에서 무엇이 급한지는 다르다.
