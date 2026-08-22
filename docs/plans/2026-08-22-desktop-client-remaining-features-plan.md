# 데스크톱 클라이언트 잔여 기능 구현 계획

**작성일**: 2026-08-22
**대상**: `apps/desktop-win` + 그것을 받쳐 주는 `apps/server` / `apps/admin` / PBX
**앞선 문서**: [기능 공백 분석](2026-08-21-csharp-desktop-client-gap-analysis.md) · [호 수락/거절 계획](2026-08-22-agent-call-offer-plan.md) · [설계](../design/2026-08-20-csharp-desktop-client-design.md)

## 결론

**5개 파동으로 나눈다. 파동 1은 서버·PBX 만, 파동 2는 클라이언트 기반 공사, 3~5가 실제 기능이다.**

| 파동 | 범위 | 왜 이 순서인가 |
|---|---|---|
| **1** | 호 분배 (presence · 큐 pause · 제안 대기시간 · 동시 제안) | 사용자가 1번으로 지목했고, **지금 운영 중인 호 흐름에 결함 3건이 박혀 있다** |
| **2** | 클라이언트 기반 (뷰모델 분해 · 서브 창 인프라) | 3~5를 **병렬로 만들 수 있게 하는 유일한 전제**. 지금은 파일 하나에 다 몰려 있다 |
| **3** | 통화 제어 (홀드 · 협의 전환 · 실기기 DTMF) | 설계서 2단계의 핵심. 통화 중 동작이라 실 PBX 검증이 필요하다 |
| **4** | 정보 화면 (상담원 목록 · 큐 현황 · 공지 · 고객 정보) | 읽기 전용이라 위험이 낮다. 서브 창 인프라에 얹힌다 |
| **5** | 현장 배포 (트레이 · 핫키 · 자동 업데이트 · 프로토콜 · 진단 · 환경설정) | 설계서 3단계. 파일럿 배포 직전에 몰아서 |

---

## 파동 1 — 호 분배

### 1-1. 앱 접속 추적 (presence)

**지금은 서버가 누가 붙어 있는지 전혀 모른다.** `realtime.gateway.ts:62-64` 의 `handleDisconnect` 는 로그 한 줄이
전부고, 접속자를 보관하는 곳(Map·Redis·DB)이 없다. 셀 수 있는 것은 익명 연결 **개수**뿐이다
(`realtime.gateway.ts:76-78`).

그래서 "앱 꺼진 상담원 큐 제외" 는 기존 값을 읽어 쓰는 일이 아니라 **presence 를 처음부터 만드는 일**이다.

**Redis 여야 하는 이유**: WS 노드가 여러 개일 수 있다. 상담원이 A 노드에 붙어 있는데 B 노드가 "아무도 없다"고
판단해 pause 를 걸면, 그 자리로 전화가 영영 안 간다.

```
키   presence:{tenantId}:{agentId} = {nodeId}
TTL  30초, 15초마다 갱신 (하트비트)
```

TTL 을 쓰는 이유는 노드가 죽으면 `handleDisconnect` 가 아예 안 돌기 때문이다. 그 경우 키가 스스로 만료돼야
한다. 명시적 disconnect 는 키를 지우고, 비정상 종료는 TTL 이 처리한다.

- **파일**: `apps/server/src/modules/realtime/agent-presence.service.ts` (신규)
- `realtime.gateway.ts` 의 `handleConnection` / `handleDisconnect` 에서 호출
- **주의**: `handleConnection` 은 지금 `client.data` 에 `sub`/`tenantId`/`role` 만 넣는다(`realtime.gateway.ts:48-50`).
  큐 pause 는 **내선**이 필요하므로 `extension` 도 함께 넣어야 한다. JWT payload 에 이미 들어 있다
  (`agent-offer.controller.ts:85` 가 `req.user.extension` 을 쓴다).

### 1-2. 큐 pause 를 한 곳으로 모은다

**이 항목이 파동 1에서 가장 중요하다.** presence 를 만들어도 pause 를 거는 경로가 흩어져 있으면
화면과 PBX 가 서로 다른 것을 말한다.

지금 상태 (전수 조사 결과):

| # | 사실 | 결과 |
|---|---|---|
| a | pause 를 거는 정규 경로는 `agent-state.service.ts:39` **단 하나** | 여기에 presence 조건을 넣으면 된다 |
| b | 로그인·로그아웃(`auth.service.ts:111,230`)이 `changeStatus` 를 **타지 않는다** | **이석 상태로 로그아웃하면 큐에서 빠진 채 남고, 재로그인해도 안 돌아온다** |
| c | `setDndMode`(`agents.service.ts:151`)가 AMI `QueuePause` 를 인터페이스 `PJSIP/{내선}` 로 **직접** 보낸다 | 큐 멤버는 `Local/{내선}@agent-offer` 다. **이 호출은 대상을 못 찾고 매번 실패한다** |
| d | `pausesQueueAssignment` 는 4개 상태(`BREAK`/`MEAL`/`TRAINING`/`MANUAL_PAUSED`), `agent-monitoring.pausedStatuses` 는 6개 | `SYSTEM_PAUSED`·`AFTER_CALL_WORK` 는 **화면엔 "일시정지"인데 큐에선 안 빠진다** |

**b·c·d 는 이번 작업이 만든 결함이 아니지만 같은 결함이다.** 한쪽만 고치면 증상이 사라져서 더 나빠진다 —
presence 를 고쳐 놓고 로그아웃 경로를 남기면, 몇 주 뒤 "앱은 켰는데 전화가 안 온다"가 전혀 다른
증상으로 다시 나타난다.

**판정을 한 함수로 모은다:**

```ts
// apps/server/src/modules/calls/agent-availability.util.ts
export function shouldPauseQueue(input: {
  appConnected: boolean;
  statusCode?: string | null;
}): boolean {
  return !input.appConnected || pausesQueueAssignment(input.statusCode);
}
```

이 함수를 **네 곳 모두**에서 부른다:

1. WS 연결 (`handleConnection`)
2. WS 해제 (`handleDisconnect`)
3. 상태 변경 (`agent-state.service.ts`)
4. 로그인 / 로그아웃 (`auth.service.ts`)

**c 는 별건으로 고친다**: `setDndMode` 의 AMI 직접 호출을 지우고 `changeStatus` 하나만 남긴다. 지금은 같은
액션이 두 번 나가고 하나는 매번 실패한다. `queueMemberInterface()` 를 쓰지 않는 QueuePause 호출은 이 한 곳뿐이다.

**d 는 목록을 한쪽으로 맞춘다**: `agent-monitoring` 이 `pausesQueueAssignment` 를 부르게 한다. 판정 로직을
두 벌 두지 않는다.

### 1-3. 제안 대기 시간을 조절 가능하게

**지금은 코드 상수 10초다** (`call-routing.constants.ts:24`). `renderAgentDialplan` 호출부 2곳
(`asterisk-reload.service.ts:923, 1029`) 어디도 `offerTimeoutSeconds` 를 넘기지 않아 `??` 우변으로 항상 떨어진다.
env 도 DB 도 통하지 않는다.

**테넌트 설정으로 올린다** — `tenantSystemSettings` 에 `agentOfferTimeoutSeconds Int @default(10)` 추가.

> **큐별이 아니라 테넌트별인 이유**: `[agent-offer]` context 는 전 상담원이 공유하는 하나의 context 다
> (`agent-dialplan.renderer.ts:509`). 큐별로 다르게 하려면 큐 이름을 AGI 인자로 넘기고 dialplan 을
> 큐 수만큼 분기해야 한다. 지금 필요한 것보다 크다. 필요해지면 그때 나눈다.

- Prisma migration 추가 (기존 migration 편집 금지)
- `asterisk-reload.service.ts` 두 호출부에서 값을 읽어 넘긴다
- 관리자 화면: `apps/admin/src/features/system-settings/` 에 입력 추가
- **상한을 서버가 클램프한다.** 지금 롱폴은 AGI 가 보낸 `timeoutSeconds` 를 그대로 믿는다
  (`agent-offer.controller.ts:46`). 60초 같은 값이 들어오면 발신자가 그만큼 방치된다

**클라이언트는 손댈 것이 없다.** `CallOffer.TimeoutSeconds` 로 이미 건별 전달된다.

### 1-4. 동시 제안 (먼저 응답한 상담원)

**지금 구조에서 거의 그대로 된다.** 큐 전략을 `ringall` 로 두면 Asterisk 가 Local 멤버를 동시에 울리고,
각 Local 채널이 각자 `[agent-offer]` 를 타 자기 상담원에게 제안한다. 먼저 수락한 사람이 `Dial(PJSIP/...)` 로
응답하면 Queue 가 그쪽과 브리지하고 나머지 Local 채널을 끊는다. 제안 pending 키가
`{linkedid}:{extension}` (`agent-offer.service.ts:26-28`) 이라 동시에 여러 개가 열려도 서로 섞이지 않는다.

**막고 있는 것 3개:**

| 지점 | 지금 | 조치 |
|---|---|---|
| `dto/create-queue.dto.ts:18`, `update-queue.dto.ts:16` | `STRATEGIES` 5개에 `ringall` 없음 → `@IsIn` 이 **400 거부** | 추가 |
| `queues/distribution-mode.ts:7` | `ADVANCED_QUEUE_STRATEGIES` 에 없음 → `leastrecent` 로 덮어씀 | 추가 |
| `apps/admin/.../queue-settings/queueStrategy.ts:1-7` | 관리자 화면 옵션에 없음 | `동시 호출(먼저 받는 상담원)` 항목 추가 |

**1-5 를 반드시 같이 한다.** 안 하면 동시 제안을 켜는 순간 결함이 드러난다.

### 1-5. 진 상담원의 제안을 즉시 닫는다

`agent-offer.service.ts:109` 의 `settle` 은 **결정 또는 타임아웃으로만** 제안을 닫는다. 다른 상담원이 먼저
받아 Asterisk 가 Local 채널을 끊으면 AGI 의 롱폴 연결만 끊길 뿐, 서버의 pending 은 타이머가 만료될
때까지 남는다.

**증상**: 진 상담원 화면에 **이미 끝난 전화의 수락 버튼이 최대 10초 더 떠 있고**, 누르면 아무 일도
일어나지 않는다. 순차 제안에서는 잘 안 보이지만 동시 제안에서는 매 통화마다 보인다.

**조치**: 롱폴 요청의 중단을 감지해 `ABANDONED` 로 settle 하고 `agent.offer.closed` 를 발행한다.
NestJS 에서는 요청 객체의 `close` 이벤트로 잡는다.

- 클라이언트는 이미 `agent.offer.closed` 를 처리한다 (`CallStateStore.Apply` → `ClearOffer`). **추가 작업 없음**

---

## 파동 2 — 클라이언트 기반

### 2-1. `SoftphoneViewModel` 을 나눈다

**1257줄이다.** 프로젝트 규칙(파일 800줄)을 이미 넘었고, 파동 3·4·5의 거의 모든 기능이 이 파일에 붙는다.
**이것이 병렬 작업을 막는 유일한 병목이다** — 여러 사람이 동시에 같은 파일을 고칠 수 없다.

이미 응집돼 있는 덩어리를 그대로 떼어낸다. 새 추상화를 만들지 않는다:

| 새 파일 | 옮기는 것 |
|---|---|
| `ViewModels/Offer/OfferViewModel.cs` | `HasOffer`, `AcceptOfferCommand`, `RejectOfferCommand`, `RespondToOfferAsync` |
| `ViewModels/Transfer/TransferViewModel.cs` | `IsChoosingTransferTarget`, `TransferTargets`, `TransferFilter`, `StartTransferCommand` 외 |
| `ViewModels/History/HistoryViewModel.cs` | `IsViewingHistory`, `History`, `OpenHistoryAsync`, `CallBackCommand` |
| `ViewModels/Keypad/KeypadViewModel.cs` | `ShowsKeypad`, `IsKeypadOpen`, `SendDigitCommand` |

`SoftphoneViewModel` 은 이들을 속성으로 노출하는 껍데기로 남는다. **기존 테스트(297개)가 그대로 통과해야
한다** — 통과하지 않으면 분해가 아니라 재작성이다.

**주의**: `MainWindow.ApplyMode`(`MainWindow.xaml.cs:112-130`)가 `softphone.HasOffer` 등을 직접 읽는다.
경로가 바뀌므로 같이 고친다.

### 2-2. 서브 창 인프라

**지금 서브 창이 하나도 없다.** `Window` 상속 클래스는 `MainWindow` 뿐이고 `ShowDialog()` 호출도 없다.
설정·이력·전환 대상 선택이 전부 `Host.Content` 를 통째로 갈아 끼우는 전체화면 전환이다.

사용자 결정(2026-08-22): **"메인 화면은 고정하고 필요한 화면은 서브 화면으로 처리한다."**

첫 서브 창을 만들 때 기반을 같이 깐다:

- **테마는 공짜다.** `App.xaml:8` 이 `Tokens.xaml` 을 앱 레벨에 머지해 둬서 새 `Window` 에서
  `{StaticResource ...}` 가 그대로 먹는다
- **`Owner` 를 반드시 메인 창으로 설정한다.** 안 하면 메인 창을 닫아도 프로세스가 안 죽는다
  (`MainWindow.Closed` → `ShutdownAsync`, `MainWindow.xaml.cs:43`)
- **로그아웃 시 정리 경로가 필요하다.** `SignOutAsync`(`:167`)와 `ShowLogin`(`:46`)이 화면을 갈아 치운다
- **뷰모델은 이벤트만 쏜다.** `SettingsRequested` / `SignOutRequested` / `WindowModeRequested` 가 이 코드베이스의
  확립된 패턴이다 — 뷰모델이 창을 직접 만들지 않는다
- **창 크기 규칙은 순수 함수로.** `WindowBounds.For`(`Services/WindowBounds.cs:47-57`)가 WPF 타입을 안 써서
  테스트가 된다. 서브 창도 같은 방식

- **파일**: `Services/SubWindowService.cs` (신규) — 창 열기·중복 방지·Owner·정리

**기존 전체화면 전환을 지금 서브 창으로 옮기지 않는다.** 파동 4에서 새 화면을 서브 창으로 만들고,
기존 것은 동작에 문제가 없으므로 그대로 둔다. 요청받지 않은 이전 작업이다.

### 2-3. 제안 남은 시간 표시

`CallOffer.TimeoutSeconds` 를 서버가 이미 내려주는데 **화면이 안 쓴다.** 1-3 으로 대기 시간이 조절
가능해지면 상담원은 몇 초가 남았는지 알 수 없게 된다. `OfferViewModel` 에 카운트다운을 넣는다.

시계는 생성자로 주입한다 (`Func<DateTimeOffset> now` — 이 코드베이스의 기존 패턴). 테스트가 시간을 민다.

---

## 파동 3 — 통화 제어

### 3-1. 홀드 / 재개

**서버는 준비돼 있다.** `POST /calls/{id}/hold`, `/resume` — 바디 없음, `JwtAuthGuard` 만.

**반드시 capability 로 게이트한다.** feature code 가 없으면 **400** 을 던진다
(`calls.service.ts:1505-1508`). 버튼을 눌러 놓고 에러를 보여 주면 안 된다.

- `GET /me/session` → `data.callControlCapabilities.holdEnabled` 로 버튼 노출 자체를 결정
- 클라이언트는 이미 `me/call-capabilities` 를 부른다 — 필드만 읽으면 된다
- **주의**: 우선순위가 DB → env 순이다. DB `featureCodes` 에 `enabled=false` 행이 있으면 env 를 채워도 400

### 3-2. 협의 전환 (attended)

엔드포인트가 6개인데 **실체는 3개**다 (나머지는 완전 동일한 별칭):

```
1. POST /calls/{id}/consultation  {target}          → 협의 시작
2. (AMI 이벤트로 CONSULT_RINGING → CONSULT_TALKING 진행)
3. POST /calls/{id}/transfer/attended/complete      → 연결
   또는 /transfer/attended/cancel                   → 취소하고 원 통화 복귀
```

**함정**: `attendedTransferCandidates` 에 열린 candidate 가 없으면 complete/cancel 이 **무조건 400**
(`calls.service.ts:1196-1198`, `1101-1103`). 즉 **`/consultation` 을 먼저 부르지 않으면 아무것도 안 된다.**
UI 상태 기계가 이 순서를 강제해야 한다.

**주의**: complete 는 AMI 전용 액션이 아니라 `ASTERISK_ATXFER_COMPLETE_CODE`(기본 `*2`) DTMF 주입이다.
env 가 비어도 기본값으로 폴백하므로 **비활성화되지 않고 틀린 코드로 계속 시도한다.** 서버는 성공 여부를
모른다 — 화면은 AMI 이벤트로 확인해야 한다.

전환 대상 선택은 파동 2에서 나온 `TransferViewModel` 을 재사용한다. blind 와 attended 는 대상 선택이
같고 **마지막 동작만 다르다.**

### 3-3. 실기기 상담원의 통화 중 DTMF

**서버에 경로가 없다.** `PlayDTMF` 는 `asterisk-manager.service.ts:157` 한 곳뿐이고 `sendFeatureCode()`
안에 갇혀 있다. 호출자는 hold/resume 과 atxfer-complete 뿐. 임의 자릿수를 보내는 엔드포인트가 없다.

지금 클라이언트 키패드가 소프트폰 모드 전용인 이유가 이것이다 (`SoftphoneViewModel:842`).

**서버에 먼저 만든다:**
- `POST /calls/{callId}/dtmf` — 바디 `{ digits: string }`
- **입력 검증이 중요하다.** `0-9*#` 만, 최대 길이 제한. AMI 로 나가는 값이라 그대로 통과시키면 안 된다
- 소유권 검사는 hold 와 같은 규칙을 재사용 (`calls.service.ts:168-188`)
- `AsteriskManagerService` 에 범용 메서드 추가 — `sendFeatureCode` 를 그대로 쓰지 말고 의도를 분리한다
- `npm run openapi:export` 갱신

---

## 파동 4 — 정보 화면

전부 **서브 창**으로 만든다. 메인 화면은 건드리지 않는다.

### 4-1. 상담원 목록

`GET /agents` 를 클라이언트가 **이미 받아오고 있다** (내선 판별용). 화면만 없다.
파동 2의 `TransferTarget.DescribeStatus` 가 상태 문구를 이미 만든다 — 재사용한다.

### 4-2. 큐 대기 현황

**WS 가 아니라 REST 를 쓴다.** 이유:

- WS `queue.summary.updated` 는 발행 3곳 모두 `tenantId` 를 안 넘겨 **전체 소켓에 브로드캐스트된다**
  (`realtime.gateway.ts:66-74`). 남의 테넌트 큐가 섞여 온다
- REST `GET /queues/summary` 는 `JwtAuthGuard` 만이라 agent 도 호출 가능하고, **필드가 더 풍부하다**
  (`waiting`/`ringing`/`talking`/`available`/`paused`/`longestWaitSeconds`/`virtualBuffer`)
- 필드명이 WS 와 다르다 (REST `waiting` ↔ WS `waitingCount`)

WS 이벤트는 **"다시 조회하라"는 신호로만** 쓴다.

> WS 브로드캐스트가 테넌트로 안 좁혀지는 것 자체는 서버 결함이다. 이 계획의 범위 밖이지만 기록해 둔다.

### 4-3. 공지

`GET /announcements` — `JwtAuthGuard` 만, agent 가능. 서버가 `targetApp`·기간을 이미 필터한다.

**WS `announcement.pushed` 본문은 신뢰하지 않는다.** 수정 이벤트의 페이로드가 관리자가 보낸 patch 필드만
담아서 **매 요청마다 필드 구성이 다르다** (`admin.service.ts:2028-2036`). 이벤트는 재조회 신호로만 쓴다.

### 4-4. 고객 정보

**`GET /customers/*` 는 agent 역할에게 전부 403 이다.** `CustomersController` 가 클래스 레벨로
`@Roles('supervisor','admin')` 을 걸어 뒀다 (`customers.controller.ts:16-18`).

**그러므로 이번 범위는 스크린팝이 이미 실어 보내는 정보를 화면에 그리는 것까지로 한다.**
`screenpop.customer` 이벤트는 서버가 무엇을 보낼지 결정해서 보내므로 권한 문제가 없고,
클라이언트는 이미 파싱해서 `CallStateStore` 에 붙이고 있다 (`AttachCustomer`).

> **결정이 필요한 별건**: 상담원이 고객 DB 를 직접 조회하게 할지는 권한 정책 문제다. 열려면
> agent 스코프 전용 엔드포인트를 따로 만들어야 한다(기존 컨트롤러의 역할 가드를 푸는 것이 아니라).
> 이 계획은 그것을 하지 않는다.

---

## 파동 5 — 현장 배포

| # | 기능 | 핵심 사실 |
|---|---|---|
| 5-1 | 트레이 아이콘 · 수신 알림 | WPF 에 트레이 API 가 없다. `System.Windows.Forms.NotifyIcon` 또는 셸 API. **창이 가려지면 전화를 놓친다** — 파동 5에서 가장 값이 크다 |
| 5-2 | 전역 핫키 | `RegisterHotKey` P/Invoke + `HwndSource`. D-4 전환 핫키와 같은 건 |
| 5-3 | 자동 업데이트 | 서버 준비됨. **2단계 토큰**: access → `updateSessionToken`(600초) → `downloadToken`(120초, **1회용**). `downloadUrl` 에 `api/v1` prefix 가 빠져 있어 클라이언트가 조립해야 한다. sha256 검증 필수 |
| 5-4 | `kastercti://` 프로토콜 | `POST /auth/handoff/exchange` 는 **공개 엔드포인트**(가드 없음). 토큰 60초·1회용. 이어서 `GET /auth/desktop/session` 으로 SIP credential 취득 |
| 5-5 | 진단 로그 | `App.Log`/`App.LogError` 가 이미 있다. 수집·전송 화면만 |
| 5-6 | 환경설정 D-2/D-3 | 통화·일반 환경설정. `JsonSettingsStore<T>` 패턴 그대로 |

---

## 함께 고쳐야 하는 것 (전수)

| 바꾸는 것 | 같이 봐야 하는 것 |
|---|---|
| 큐 pause 판정 | WS 연결 · WS 해제 · 상태 변경 · **로그인/로그아웃** 4곳 전부 |
| 큐 전략 목록에 `ringall` | 서버 DTO 2개(`create`/`update`) + `distribution-mode.ts` + 관리자 UI |
| `SoftphoneViewModel` 분해 | `MainWindow.ApplyMode` 의 플래그 참조 경로 |
| REST 엔드포인트 추가 | `{success,data,error}` envelope + `npm run openapi:export` |
| Prisma schema | 새 migration + `npm run prisma:sync` + 관련 spec |
| PBX conf 렌더러 | 짝 `*.renderer.spec.ts` + `asterisk-config-validation.ts` |

---

## 검증

**파동 1·3 은 실 PBX 검증 없이 완료 처리하지 않는다.** 렌더러 테스트는 문자열이 맞다는 것만 증명한다.

| 파동 | 검증 방법 |
|---|---|
| 1-1/1-2 | 앱 종료 → `queue show` 에 paused 확인 → 재실행 → 해제 확인. **이석 상태로 로그아웃 후 재로그인** 경로를 따로 확인 |
| 1-3 | 관리자에서 값 변경 → conf 재렌더 → AGI 인자 확인 → 실통화로 대기 시간 측정 |
| 1-4/1-5 | 상담원 2명 동시 접속 → 실통화 → **양쪽에 동시에 뜨는지**, 한쪽 수락 시 **다른 쪽이 즉시 사라지는지** |
| 2 | 기존 297개 테스트 전부 통과 (분해는 동작을 바꾸지 않는다) |
| 3-1/3-2 | 실통화에서 홀드 중 발신자가 대기음을 듣는지, 협의 취소 후 원 통화로 돌아오는지 |
| 3-3 | 실기기 상담원이 ARS 로 전화 걸어 키패드 입력이 먹는지 |

---

## 이 계획이 답하지 않는 것

- **상담원의 고객 DB 조회 권한.** 4-4 참조. 권한 정책 결정이 필요하다
- **큐별 제안 대기 시간.** 1-3 은 테넌트 단위다. 큐별로 나누려면 dialplan 구조를 바꿔야 한다
- **WS 큐 요약이 테넌트로 안 좁혀지는 문제.** 4-2 에서 우회했을 뿐 고치지 않았다
- **파동 5의 내부 우선순위.** 트레이 알림이 가장 값이 크다고 보지만, 현장에서 무엇이 급한지는 다를 수 있다
