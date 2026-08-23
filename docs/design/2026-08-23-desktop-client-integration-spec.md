# 상담원 데스크톱 클라이언트 연동 규격

작성일: 2026-08-23
대상: `apps/desktop-win/src/KAster.Desktop.Core/` (커밋 `0cf9f72` 기준)
성격: 인터페이스 계약 (`-spec`)

C# 데스크톱 상담원 앱이 **실제로 부르는** REST 경로와 **구독하는** 실시간 이벤트를 적는다.
서버가 가진 엔드포인트 전부가 아니다 — 클라이언트가 안 쓰는 경로를 섞으면 다음 사람이
"이것도 쓰나" 를 확인하는 데 시간을 쓴다. 전체 REST 스냅샷은 [`docs/openapi.json`](../openapi.json),
서버 쪽 이벤트 이름의 원전은 `apps/server/src/modules/realtime/realtime-events.ts` 다.

경로만이 아니라 **왜 그 경로인지**를 같이 적는다. 이 프로젝트에서 실제로 사람을 태운 것들이라,
목록만 남기면 다음에 같은 자리를 다시 밟는다.

- REST prefix: `/api/v1`
- 실시간: `/ws` 네임스페이스, Socket.IO v4 / Engine.IO v4
- 구현: `Server/CtiServerClient.cs`, `Server/AuthClient.cs`, `Server/CtiEventClient.cs`

---

## 1. 공통 규약

모든 응답은 봉투 하나로 온다. 성공이든 실패든 겉모양이 같고, 내용물이 있는 자리(`data`)와
사유가 적히는 자리(`error`)가 정해져 있다. 클라이언트는 `Server/EnvelopeReader.cs` 한 곳에서만
이 봉투를 벗긴다.

```jsonc
// 성공
{ "success": true, "data": { … }, "error": null }

// 실패 — 상태 코드와 함께 온다
{ "success": false, "data": null, "error": { "code": "FORBIDDEN", "message": "…" } }
```

### 오류 코드 매핑 (`AllExceptionsFilter`)

| Prisma | HTTP | 뜻 |
|---|---|---|
| `P2002` | 409 | 유니크 제약 충돌 — 같은 것이 이미 있다 |
| `P2025` | 404 | 고칠 대상이 없다 |
| `P2000` · `P2023` | 400 | 값의 길이나 형식이 틀렸다 (UUID 자리에 딴 것) |

### 함정 — 접수는 완료가 아니다

통화 제어 명령은 대부분 `{ accepted: true }` 를 **즉시** 돌려준다. PBX 가 실제로 그 일을 했는지는
그 응답에 없다. 서버는 AMI 로 명령을 넣었을 뿐이고, 성사 여부는 뒤따라오는 `call.updated` ·
`call.ended` 이벤트로 판정된다.

그래서 화면은 **응답을 보고 상태를 바꾸지 않는다.** 눌린 버튼을 잠그고 이벤트를 기다린다.
응답만 믿으면 실패한 보류가 화면에서는 걸린 것으로 남는다.

---

## 2. 인증과 세션 (`AuthClient`)

access 15분 · refresh 14일. refresh 는 **1회용**이라 쓰는 순간 서버가 회수하고 새 것을 준다.
서버는 refresh 원본을 갖지 않고 SHA-256 해시만 저장한다.

| 메서드 | 경로 | 비고 |
|---|---|---|
| POST | `auth/login` | `clientType` 이 `desktop` 이어야 SIP credential 이 실린다 |
| POST | `auth/refresh` | 토큰만 회전. **softphoneConfig 에 비밀번호가 없다** |
| GET | `auth/desktop/session` | SIP 비밀번호가 실리는 유일한 창구 + `callCapabilities` |
| GET | `me/session` | `callControlCapabilities` — 보류·음소거 버튼을 열지 말지 |
| POST | `auth/handoff/exchange` | 웹에서 넘어온 1회용 표를 토큰으로 교환 |
| POST | `auth/logout` | 멱등 — 토큰이 없어도 성공으로 답한다 |

```jsonc
// POST auth/login
→ { "loginId", "password", "extension", "clientType": "desktop" }
← { accessToken, refreshToken, expiresIn: 900, agent, softphoneConfig }

// POST auth/refresh
→ { "refreshToken" }
← { accessToken, refreshToken, agent, softphoneConfig }   // 비밀번호 없음
```

`me/session` 의 `callControlCapabilities` 는 **블록이 통째로 없는 현장**이 있다. 없으면 전부 불가로
떨어진다 — 없는 기능의 버튼을 열어 두면 상담원이 통화 중에 눌러 보고 나서야 400 을 받는다.

### 함정 — 자동 로그인은 두 번 물어야 한다

자동 로그인은 `auth/refresh` 로 되살아나는데 그 응답에는 SIP 비밀번호가 없다. 웹 클라이언트도
같은 응답을 받으므로 서버가 credential 을 싣지 않기 때문이다. 그것만 들고 들어가면 소프트폰
자리는 전화를 한 통도 못 받고, 실기기 자리는 전화기에 넣을 값을 화면에서 잃는다.

되살린 직후 `auth/desktop/session` 을 이어서 부르고 그 `softphoneConfig` 로 덮어쓴다.
**못 받아도 로그인은 살린다** — 전화를 못 걸 뿐이고, 여기서 막으면 상담원은 아무것도 못 한다.

> 실제 사고: 내선 1002 (소프트폰 자리) 가 자동 로그인 뒤 전화를 한 통도 못 받았다.
> 핸드오프 경로는 이미 데스크톱 세션을 부르고 있었고 자동 로그인만 빠져 있었다. 커밋 `0cf9f72`.

### 401 회전 규칙 (`TokenRefreshHandler`)

은행 창구에 비유하면, 번호표가 만료됐을 때 줄 선 사람 전원이 새로 뽑으러 가는 게 아니라 맨 앞
한 명만 다녀오고 나머지는 그 표를 같이 쓴다. 서버 refresh 가 회전형이라 동시에 여러 번 부르면
뒤의 것이 전부 실패하고 로그아웃된다.

1. 모든 REST 요청에 `Authorization: Bearer` 를 붙인다.
2. **401 이면 한 번만** 회전한다. 회전은 회전용 클라이언트로 보낸다 — 같은 핸들러를 타면 자기를 다시 부른다.
3. 새 토큰으로 **원 요청을 한 번** 재시도한다. 두 번은 하지 않는다.
4. 회전이 실패하면 재로그인 신호를 올린다. 못 쓰는 토큰은 금고에서 지운다.

---

## 3. 통화 제어 (`CtiServerClient`)

전부 `{ accepted, commandId }` 모양의 접수증을 돌려준다. `callId` 는 경로에 넣고, 내 내선은
**본문에 싣지 않는다** — 서버가 토큰에서 꺼내므로 남의 내선으로 거는 길 자체가 없다.

### 3.1 발신

| 메서드 | 경로 | 본문 |
|---|---|---|
| POST | `client/call-commands/originate` | `{ commandId, phoneNumber, callerId? }` |
| POST | `calls/originate/internal` | `{ targetExtension }` |

`calls/originate` **가 아니다.** 그쪽은 supervisor · admin 전용이라 상담원이 부르면 403 이다.
전용 경로는 헤더 다섯 개가 모두 있어야 접수된다.

```
x-client-protocol:   kaster-desktop-v1   // 이 값 하나만 받는다
x-command-timestamp: 1755930000000       // 서버와 ±60초
x-command-nonce:     32자리 hex          // 재사용되면 거부 (이중 발신 방지)
x-correlation-id:    uuid
idempotency-key:     uuid
```

`callerId` 는 서버가 허용 목록으로 검증하므로 고르지 않았으면 아예 보내지 않는다.
내선 통화(`originate/internal`)는 명령 프로토콜 헤더가 필요 없다.

### 3.2 받기와 끊기

| 메서드 | 경로 | 본문 | 비고 |
|---|---|---|---|
| POST | `client/call-commands/offer/decision` | `{ linkedid, extension, decision }` | `ACCEPT` \| `REJECT` |
| POST | `calls/{callId}/answer` | `{}` | |
| POST | `calls/{callId}/pickup` | `{}` | `QUEUED` · `RINGING_AGENT` 일 때만 |
| POST | `calls/{callId}/hangup` | `{}` | |

제안(offer)은 큐가 넘기기 전에 물어보는 호다. 수락해야 전화기가 연결되고, 그 전까지 고객은 큐에서
대기음을 듣는다. 답하지 않으면 서버가 시간이 지난 뒤 알아서 넘긴다.

`hangup` 과 `transfer` 는 서버가 `legType === 'agent' && !endedAt` 인 leg 를 골라 처리한다 —
"가장 최근" 휴리스틱이 아니다.

### 3.3 통화 중

| 메서드 | 경로 | 본문 | 비고 |
|---|---|---|---|
| POST | `calls/{callId}/hold` · `/resume` | `{}` | feature code 방식 — 현장에 없으면 기능 자체가 꺼진다 |
| POST | `calls/{callId}/mute` | `{ state: "on" \| "off" }` | 소프트폰은 자기 오디오를 직접 끊는다 |
| POST | `calls/{callId}/dtmf` | `{ digits }` | **실기기 전용**. `0-9 * #`, 최대 32자리 |
| POST | `calls/{callId}/memo` | `{ agentId, memoType: "acw", memoText, isFinal: true }` | |

보류는 표준 AMI 액션이 아니다. 서버는 `ASTERISK_HOLD_FEATURE_CODE` 를 DTMF 로 넣을 뿐이고,
실제 상태는 뒤따라오는 `Hold` 이벤트로 판정된다. 열지 말지는 `me/session` 이 정한다.

DTMF 가 실기기 전용인 이유는 소프트폰이 자기 SIP 다이얼로그로 직접 보내기 때문이다.
서버 경로는 AMI `PlayDTMF` 로 상담원 leg 에 넣는다.

### 3.4 전환

| 메서드 | 경로 | 본문 |
|---|---|---|
| POST | `calls/{callId}/transfer` | `{ transferType: "blind", target, fromExtension }` |
| POST | `calls/{callId}/consultation` | `{ target }` |
| POST | `calls/{callId}/transfer/attended/complete` | `{}` |
| POST | `calls/{callId}/transfer/attended/cancel` | `{}` |

attended 전환은 `consultation` 을 **먼저 부르지 않으면** 완료도 취소도 서버가 400 으로 막는다 —
열린 협의가 있어야 닫을 것이 있다. 완료는 feature code 를 DTMF 로 넣을 뿐이고, 실제 완료는
`AttendedTransfer` 이벤트로 판정된다. 취소 후 원 통화 복귀는 PBX 의 `atxferabort` 설정에 달려 있어
서버도 성공 여부를 모른다.

### 3.5 근무 상태

| 메서드 | 경로 | 본문 |
|---|---|---|
| POST | `agents/{agentId}/status` | `{ statusCode, reasonCode? }` |

남의 상태를 바꾸려면 supervisor · admin 이어야 한다. 상태 변경은 큐 pause 와 묶여 있어
**이 경로 하나로만** 나간다 — DB 를 직접 쓰면 큐에서 빠진 채 남는다.

---

## 4. 조회

| 메서드 | 경로 | 비고 |
|---|---|---|
| GET | `calls/active` | `call.created` · `call.updated` 이벤트와 **같은 페이로드** |
| GET | `calls/history?agentId=&limit=` | `agentId` 필수 — 아래 참조 |
| GET | `agents` | 전환 대상 + **실기기 SIP 등록 확인**(`sipRegistration.registered`) |
| GET | `queues/summary` | 큐 대기 현황 — WS 대신 이 경로 |
| GET | `announcements` | 서버가 이미 걸러 준다. 쿼리 파라미터 없음 |
| GET | `me/call-capabilities` | 발신 권한과 쓸 수 있는 발신번호 |

**`calls/history` 는 `agentId` 를 반드시 싣는다.** 빼면 서버가 테넌트 전체의 통화를 돌려주고,
상담원이 남의 통화 기록을 보게 된다.

**큐 현황은 REST 로 본다.** WS `queue.summary.updated` 브로드캐스트는 테넌트로 좁혀지지 않아
남의 테넌트 큐가 섞여 오고 필드도 적다. `queues/summary` 는 `JwtAuthGuard` 만이라 상담원도 부를 수 있다.

**공지 읽음 처리는 부르지 않는다.** `POST admin/announcements/{id}/read` 는 supervisor · admin
전용이라 상담원이 부르면 403 이다. 읽음 표시는 이 PC 안에만 남는다.

---

## 5. 실시간 이벤트 (`CtiEventClient`)

`/ws` 네임스페이스에 접속할 때 `auth: { token }` 으로 access token 을 싣는다.

### 함정 — 자동 재연결을 끈다

라이브러리의 자동 재연결은 **처음 붙을 때의 토큰을 그대로 다시 쓴다.** access token 은 15분이면
만료되므로 15분 뒤의 자동 재연결은 영원히 실패한다. `Reconnection = false` 로 끄고, 끊김을
감지하면 새 토큰으로 직접 다시 붙는다.

붙어 있다는 근거는 이벤트가 아니라 **ping** 이다. 한가한 시간에는 이벤트가 없다. Engine.IO v4
서버는 25초마다 ping 을 보내므로, 45초 무음이면 두 번을 놓친 것이고 죽은 연결로 본다.

### 이벤트 목록 (`CtiEventNames`)

| 이름 | 페이로드 |
|---|---|
| `agent.offer` | `{ offerId, linkedid, extension, caller?, timeoutSeconds }` |
| `agent.offer.closed` | `{ offerId, extension, decision }` |
| `call.created` · `call.updated` · `call.ended` | `ActiveCall` (아래) |
| `screenpop.customer` | `{ callId, customer }` |
| `agent.status.changed` | 근무 상태 변경 (관리자가 바꾼 경우에도 온다) |
| `queue.summary.updated` | 구독하지만 **화면에 쓰지 않는다** (§4 참조) |
| `announcement.pushed` | `{ announcementId, title, body, action? }` |

```jsonc
// ActiveCall — GET calls/active 와 세 통화 이벤트가 공유한다
{
  callId, linkedid, ani, dnis, queueName,
  didNumber, representativeNumber, branchName, branchCode,
  sessionStatus, startedAt, queuedAt, answeredAt,
  primaryAgentId, resultCode, isMuted,
  customer: { customerId, customerName, grade, phoneNumber, companyName, memo }
}
```

`agent.offer.closed` 를 **안 내리면** 이미 끝난 통화의 수락 버튼이 화면에 남아 상담원이 그걸 누르게 된다.

모르는 이벤트 이름이 오면 버리지 않고 따로 기록한다(`UnparsedEvent`). 서버가 이벤트를 추가했을 때
클라이언트가 조용히 무시하면 그 사실을 아무도 모른 채 몇 주가 지난다.

---

## 6. SIP 등록 (`SoftphoneOptions`)

소프트폰 자리는 서버가 내려준 `softphoneConfig` 를 등록 정보로 바꿔 PBX 에 REGISTER 한다.
실기기 자리는 같은 값을 **화면에 띄워** 상담원이 책상 전화기에 옮겨 적게 한다.

| 필드 | 쓰임 | 없으면 |
|---|---|---|
| `enabled` | 이 테넌트가 소프트폰을 쓰는가 | 등록하지 않는다 |
| `sipServer` | `host:port`. 포트를 안 적으면 5060 | 등록 불가 |
| `sipUri` | `sip:1001@도메인` — 뒷부분이 SIP 도메인 | 서버 호스트를 도메인으로 |
| `authorizationUsername` | SIP 계정. 보통 내선번호 | `sipUri` 앞부분에서 꺼낸다 |
| `authorizationPassword` | 등록 비밀번호 | **등록 불가** |
| `transport` | `udp` 또는 `tls` | `udp` |
| `displayName` | 상대 전화기에 뜨는 이름 | 빈 값 |

비밀번호는 상담원 개인 값이 있으면 그것을, 없으면 **테넌트 기본 비밀번호**를 쓴다. 서버가 그 선택을
하므로 클라이언트는 받은 값을 그대로 쓴다. 등록 갱신은 120초 주기다.

### 함정 — 못 켠 이유를 반드시 남긴다

설정이 모자라 소프트폰이 **아예 안 켜지는** 것과 등록이 **실패하는** 것은 다르다. 앞의 경우 SIP
스택은 아무 신호도 내지 않으므로, 사유를 여기서 버리면 화면에는 "전화 꺼짐" 만 남고 로그에도
아무것도 없다.

못 켠 사유(`SoftphoneRuntime.SoftphoneStartFailure`)와 등록 상태 변화를 모두 기록한다.
같은 상태가 이어지면 적지 않는다 — 2분마다 갱신이라 그냥 두면 로그가 등록 갱신으로 가득 찬다.

---

## 7. 자동 업데이트 (`UpdateClient`)

로그인 토큰으로 바로 파일을 받지 않는다. 업데이트 전용 토큰을 한 번 끊고, 파일마다 표를 따로 끊는다.

1. `POST agent-updates/session` — `{ deviceId, currentVersion }` → **600초짜리 세션 토큰**.
   이 뒤로는 로그인 토큰을 쓰지 않는다.
2. `GET agent-updates/manifest?currentVersion=&channel=` — 승인된 릴리스가 없으면 404 가 아니라
   **`success: true, data: null`** 로 온다.
3. 새 버전인지 **클라이언트가 가른다.** 서버는 최신 릴리스를 그대로 줄 뿐 우리 버전과 비교해 주지 않는다.
4. `POST agent-updates/download-init` — `{ artifactId, currentVersion }` → **1회용 표**.
   다운로드가 끊기면 같은 표로 다시 못 하고 여기부터 다시 한다.
5. `GET agent-updates/artifacts/{artifactId}` — `.part` 로 받아 **지문을 맞춘 뒤에만** 제자리에 놓는다.
6. `POST agent-updates/report` — 결과를 알린다. 실패해도 앱은 계속 간다.

업데이트 요청은 **토큰 회전 핸들러를 타지 않는다.** 그 핸들러는 모든 요청에 로그인 토큰을 덮어쓰는데,
manifest 와 다운로드는 각자 다른 토큰을 실어야 한다.

관련 문서: [`design/agent-desktop-update-api.md`](agent-desktop-update-api.md)

---

## 8. 로컬 창구 (브라우저 ↔ 데스크톱)

웹 상담원 화면에서 데스크톱 앱으로 자리를 넘기는 길. 두 갈래가 같이 쓰인다 — **스킴**은 앱을 깨우고,
**로컬 HTTP** 는 웹 화면이 결과를 확인한다.

### 프로토콜 스킴

```
kastercti://connect?handoffToken=…&serverUrl=…&channel=…
// kaster-agent:// 도 같은 것으로 받는다 (웹앱이 실제로 내보내는 스킴)
```

`serverUrl` 은 **참고만 한다.** 교환은 이 PC 에 설정된 주소로 나가고, 두 주소가 다른 서버면 요청을
받지 않는다. 앱이 꺼져 있을 때는 요청이 창보다 먼저 프로세스 인자로 도착하므로 큐에 넣었다가
창이 뜬 뒤 처리한다(`ProtocolInbox`).

### 로컬 HTTP · `127.0.0.1:48125`

| 메서드 | 경로 | 응답 |
|---|---|---|
| GET | `/health` | `{ ok, status: "ok", app: "kaster-agent-desktop", protocol: "kaster-agent" }` |
| GET | `/handoff-status?handoffToken=` | `{ ok, state: "connected" \| "failed" \| "unknown", reason }` |

토큰은 **되돌려 주지 않는다.** 웹앱이 읽지 않는 값이고, 아무나 보낸 문자열을 되비칠 이유가 없다.

127.0.0.1 에만 바인딩하고, 포트가 이미 쓰이면 **조용히 물러난다** — 한 PC 에 상담원이 둘 앉으면
뒤에 뜬 쪽은 이 창구를 못 연다. 웹 연동만 안 될 뿐 통화는 그대로 돈다. 브라우저의 사설망 사전
요청(preflight)에 답해야 하므로 CORS 헤더를 함께 실어야 한다
(`Access-Control-Allow-Private-Network` 포함).

관련 문서: [`design/2026-04-23-agent-desktop-bidirectional-handoff-design.md`](2026-04-23-agent-desktop-bidirectional-handoff-design.md)

---

## 9. 상태값과 주기

### 통화 상태 · `sessionStatus`

| 값 | 뜻 | 클라이언트 화면 |
|---|---|---|
| `NEW` · `IVR` | 들어왔고 아직 큐 전 | 안 띄운다 |
| `QUEUED` | 큐 대기 중 | 대기 목록 · 당겨받기 가능 |
| `RINGING_AGENT` | 상담원 호출 중 | 수신 화면 · 당겨받기 가능 |
| `TALKING` | 통화 중 | 통화 화면 |
| `HOLD` | 보류 | 통화 화면 (보류 표시) |
| `TRANSFERRING` | 전환 중 | 전환 화면 |
| `AFTER_CALL_WORK` | 후처리 | 후처리 화면 (메모 저장) |
| `ENDED` | 종료 | 목록에서 내린다 |

### 근무 상태 · `statusCode`

`AVAILABLE` · `RINGING` · `TALKING` · `AFTER_CALL_WORK` · `BREAK` · `MEAL` · `TRAINING` ·
`MANUAL_PAUSED`.

상담원이 직접 고를 수 있는 것은 `AVAILABLE` 과 자리비움 계열뿐이고, 나머지는 통화 흐름이 정한다.

### 주기

| 무엇 | 주기 | 왜 그 값인가 |
|---|---|---|
| 대기 통화 목록 | 5초 | 당겨받기 판단이 늦으면 이미 남이 받았다 |
| 큐 현황 | 5초 | 대기 인원이 늘어나는 것을 눈으로 봐야 한다 |
| 상담원 목록 | 10초 | 전환 대상의 통화 여부. 이보다 잦을 이유가 없다 |
| 실기기 등록 확인 | 5초 / 30초 | 값을 넣는 동안엔 바로 반응해야 하고, 붙은 뒤엔 죽는 것만 알면 된다 |
| WS 하트비트 한도 | 45초 | 서버 ping 이 25초. 두 번 놓치면 죽은 연결 |
| SIP 등록 갱신 | 120초 | PBX 기본값에 맞춘다 |

---

## 관련 문서

- [`design/2026-08-20-csharp-desktop-client-design.md`](2026-08-20-csharp-desktop-client-design.md) — 클라이언트 전체 설계
- [`design/cti-event-contract.md`](cti-event-contract.md) — 서버 쪽 CTI 이벤트 계약
- [`design/agent-desktop-update-api.md`](agent-desktop-update-api.md) — 업데이트 API 상세
- [`docs/openapi.json`](../openapi.json) — 전체 REST 스펙 스냅샷 (`npm run openapi:export` 로 갱신)
