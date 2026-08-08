# 외부 CTI 연동 API 가이드

작성일: 2026-08-07

## 목적

이 문서는 외부 업무 애플리케이션이 KAster_CTI의 인증, 통화 조회, 통화 제어, 실시간 이벤트를 연동할 때 사용하는 서버 API 계약을 정리한다. Atalk CTI 문서의 기능 범위를 참고하되, 현재 프로젝트의 REST API, Socket.IO 이벤트, PBX 제어 구조에 맞춘다.

## 기본 규칙

- 기본 URL: `https://<server-domain>/api/v1`
- Swagger UI: `https://<server-domain>/docs`
- 정적 OpenAPI: `docs/openapi.json`
- 인증 방식: `Authorization: Bearer <accessToken>`
- 공통 응답 envelope:

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

실패 응답:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "BAD_REQUEST",
    "message": "error message"
  }
}
```

통화 제어 API의 `accepted: true`는 명령 접수를 의미한다. 실제 통화 성공/실패는 후속 PBX 이벤트가 세션 상태를 갱신한 뒤 `call.updated` 또는 `call.ended` 이벤트와 조회 API로 확인한다.

## 인증

### 로그인

`POST /auth/login`

일반 상담원은 `loginId`, `extension`, `password`가 필요하다. `supervisor` 또는 `admin`은 `extension` 없이 로그인할 수 있다.

```json
{
  "loginId": "agent1001",
  "extension": "1001",
  "password": "Password123!"
}
```

응답의 주요 필드:

```json
{
  "success": true,
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "agent": {
      "agentId": "...",
      "agentName": "상담원1",
      "extension": "1001",
      "role": "agent"
    }
  },
  "error": null
}
```

### 토큰 갱신

`POST /auth/refresh`

```json
{
  "refreshToken": "..."
}
```

Refresh token은 요청마다 회전한다. 새 refresh token을 받은 뒤 이전 값은 폐기해야 한다.

### 현재 세션 및 기능 확인

`GET /me/session`

외부 클라이언트는 이 API로 상담원 정보, 발신 권한, 통화 제어 가능 여부를 확인한다.

중요 필드:

```json
{
  "callControlCapabilities": {
    "muteEnabled": true,
    "answerEnabled": true,
    "answerMode": "pickup_redirect",
    "holdEnabled": true,
    "holdMode": "feature_code",
    "consultationTransferEnabled": true,
    "dndEnabled": true,
    "dndMode": "queue_pause",
    "singleStepConferenceEnabled": false,
    "singleStepConferenceUnavailableReason": "...",
    "extensionForwardingEnabled": false,
    "extensionForwardingUnavailableReason": "..."
  },
  "callCapabilities": {
    "canOriginateExternal": true,
    "canOriginateInternal": true,
    "canUsePhoneDirect": false,
    "disabledReasons": []
  }
}
```

## 실시간 이벤트

Socket.IO namespace: `/ws`

연결 예:

```ts
import { io } from 'socket.io-client';

const socket = io('https://<server-domain>/ws', {
  auth: { token: accessToken },
  transports: ['websocket', 'polling'],
});
```

주요 이벤트:

| 이벤트 | 설명 |
| --- | --- |
| `call.created` | 새 통화 세션 생성 |
| `call.updated` | 통화 상태, 담당 상담원, 보류/전환 등 변경 |
| `call.ended` | 통화 종료 |
| `screenpop.customer` | 고객 화면 팝업 정보 |
| `agent.status.changed` | 상담원 상태 변경 |
| `queue.summary.updated` | 큐 요약 변경 |

## 통화 조회

### 활성 통화 목록

`GET /calls/active`

선택 query:

| 이름 | 설명 |
| --- | --- |
| `branchId` | 지사 범위 |
| `limit` | 기본 500, 최대 1000 |

### 통화 상세

`GET /calls/{callId}`

세션, leg, 메모, 전환 이력, 녹취, 큐 이벤트를 반환한다.

### 통화내역

`GET /calls/history`

선택 query:

| 이름 | 설명 |
| --- | --- |
| `from` / `to` | ISO 날짜 범위 |
| `agentId` | 상담원 필터 |
| `branchId` | 지사 필터 |
| `status` | `ENDED`, `QUEUED`, `TALKING`, `AFTER_CALL_WORK`, `RINGING_AGENT` |
| `mode` | `missed`, `all` |
| `direction` | `inbound`, `outbound`, `internal` |
| `remoteNumber` | 발신자/수신자 번호 부분 검색 |
| `callType` | `I`, `O`, `N`, `A`, `M`, `C`, `R`, `IT`, `OT` |
| `limit` | 기본 500, 최대 1000 |

`callType` 매핑:

| 값 | 의미 | 현재 매핑 |
| --- | --- | --- |
| `I` | 성공한 수신호 | inbound + answered |
| `O` | 성공한 발신호 | outbound + answered |
| `N` | 발신 무응답 | outbound + unanswered |
| `A` | 수신 부재중 | inbound + unanswered |
| `M` | offline 수신 부재중 | inbound + unanswered |
| `C` | 발신 취소 | outbound + unanswered |
| `R` | 수신 거부 | inbound + unanswered |
| `IT` | 수신 전환호 | inbound + transfer |
| `OT` | 발신 전환호 | outbound + transfer |

예:

```http
GET /api/v1/calls/history?from=2026-08-01T00:00:00.000Z&to=2026-08-07T23:59:59.999Z&remoteNumber=01012345678&callType=I&limit=100
Authorization: Bearer <accessToken>
```

## 통화 제어

모든 통화 제어 API는 Bearer token이 필요하다. 권한이 없는 상담원은 본인에게 배정된 통화만 제어할 수 있다.

### 외부 발신

일반 상담원 클라이언트는 아래 클라이언트 명령 프로토콜을 사용한다.

`POST /client/call-commands/originate`

필수 headers:

| 이름 | 값 |
| --- | --- |
| `x-client-protocol` | `kaster-desktop-v1` |
| `x-command-timestamp` | Unix epoch milliseconds |
| `x-command-nonce` | 16-128자 고유 nonce |
| `x-correlation-id` | 요청 추적 ID |
| `idempotency-key` | 멱등 키 |

본문:

```json
{
  "commandId": "cmd-20260807-0001",
  "phoneNumber": "01012345678",
  "callerId": "15771577",
  "customerId": "optional-customer-uuid"
}
```

상담원 내선은 요청 본문이 아니라 인증 세션과 DB 상담원 정보에서 파생한다. `/calls/originate`는 supervisor/admin 운영 제어용이며 일반 상담원 외부 발신에는 사용하지 않는다.

### 내선 발신

`POST /calls/originate/internal`

```json
{
  "targetExtension": "1002",
  "targetAgentId": "optional-agent-uuid"
}
```

### 수신 응답

`POST /calls/{callId}/answer`

현재 구성에서는 큐 대기 또는 상담원 호출 중인 고객 leg를 현재 상담원 내선으로 redirect하는 방식으로 처리한다. 기존 `POST /calls/{callId}/pickup`도 같은 PBX 경로를 사용한다.

### 통화 종료

`POST /calls/{callId}/hangup`

활성 상담원 leg에 PBX Hangup을 요청한다.

### 음소거

`POST /calls/{callId}/mute`

```json
{
  "state": "on",
  "direction": "all"
}
```

`state`: `on`, `off`

`direction`: `in`, `out`, `all`

### 보류 / 보류 해제

`POST /calls/{callId}/hold`

`POST /calls/{callId}/resume`

PBX feature code가 설정되어 있을 때만 동작한다. 기능 가능 여부는 `GET /me/session`의 `callControlCapabilities.holdEnabled`와 `holdMode`를 확인한다.

### 블라인드 전환

`POST /calls/{callId}/transfer`

```json
{
  "transferType": "blind",
  "target": "1002",
  "fromExtension": "1001"
}
```

서버는 보안을 위해 클라이언트가 보낸 `fromExtension`을 그대로 신뢰하지 않고 실제 활성 agent leg에서 제어 내선을 다시 계산한다.

### 상담 전환 시작

두 API가 같은 동작을 제공한다.

- `POST /calls/{callId}/transfer` with `transferType: "attended"`
- `POST /calls/{callId}/consultation`

`POST /calls/{callId}/consultation`

```json
{
  "target": "1002"
}
```

현재 PBX 구조에서는 attended transfer 시작으로 처리한다.

### 상담 전환 취소 / 원 통화 복귀

두 API가 같은 동작을 제공한다.

- `POST /calls/{callId}/transfer/attended/cancel`
- `POST /calls/{callId}/reconnect`

열린 attended transfer candidate를 닫고 PBX CancelAtxfer를 요청한다.

### 상담 전환 완료

두 API가 같은 동작을 제공한다.

- `POST /calls/{callId}/transfer/attended/complete`
- `POST /calls/{callId}/transfer-call`

PBX feature code로 attended transfer 완료를 요청한다. 실제 완료는 후속 `AttendedTransfer` 계열 이벤트 처리 후 세션이 갱신될 때 확정된다.

## 상담원 상태 / DND

### 상태 변경

`POST /agents/{agentId}/status`

```json
{
  "statusCode": "AVAILABLE",
  "reasonCode": "optional"
}
```

### 수신거부

`POST /agents/{agentId}/dnd`

```json
{
  "enabled": true
}
```

현재 구성의 DND는 단말 자체 기능이 아니라 PBX 큐 멤버 pause/unpause로 구현한다.

- `enabled: true`: `QueuePause PJSIP/{extension} true`, 상담원 상태 `BREAK`, 사유 `DND`
- `enabled: false`: `QueuePause PJSIP/{extension} false`, 상담원 상태 `AVAILABLE`

따라서 큐 분배 수신은 차단되지만, 별도 direct dial 또는 PBX dialplan이 큐를 우회하는 경우까지 차단하려면 추가 PBX 정책이 필요하다.

## 착신전환

현재 제공되는 착신전환은 내선 단말 착신전환이 아니라 DID 인입 라우팅 규칙이다. supervisor/admin 권한으로 다음 API를 사용한다.

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/asterisk-config/forwarding-rules` | DID 착신전환 규칙 목록 |
| `POST` | `/asterisk-config/forwarding-rules` | DID 착신전환 규칙 생성 |
| `PUT` | `/asterisk-config/forwarding-rules/{id}` | DID 착신전환 규칙 수정 |
| `DELETE` | `/asterisk-config/forwarding-rules/{id}` | DID 착신전환 규칙 삭제 |

생성 예:

```json
{
  "didId": "did-uuid",
  "forwardType": "EXTERNAL_NUMBER",
  "targetValue": "01012345678",
  "forwardTriggerMode": "IMMEDIATE",
  "conditionType": "ALWAYS",
  "enabled": true
}
```

문서식 내선별 `SetForwarding`을 추가하려면 다음 작업이 필요하다.

- 내선별 forwarding 상태 저장 DB 모델 추가
- PBX endpoint별 forwarding lookup dialplan 또는 ASTDB 계약 추가
- AMI/설정 reload 반영 방식 결정
- direct dial, queue dial, transfer-target 경로에서 forwarding 적용 범위 정의

## 현재 제공 불가 또는 조건부 기능

| 기능 | 상태 | 이유 | 추가 가능 여부 |
| --- | --- | --- | --- |
| Raw CSTA WebSocket 명령 | 미제공 | 현재 프로젝트는 REST 명령 + Socket.IO 이벤트 구조다. JSON line 기반 CSTA command gateway가 없다. | 가능. 별도 gateway, 명령 매핑, 인증/권한/응답 형식 설계 필요 |
| `SingleStepConferenceCall` | 미제공 | 3자 회의 참가자 leg와 conference 세션 상태를 저장하는 DB/세션 모델이 없다. | 가능. conference dialplan/AMI 제어와 세션 모델 확장 필요 |
| 내선 단말 `SetForwarding` | 미제공 | 현재 착신전환은 DID 인입 라우팅 규칙이다. | 가능. 내선 forwarding DB, dialplan/ASTDB 계약 필요 |
| `AnswerCall`의 단말 answer 직접 제어 | 조건부 제공 | 현재 구현은 고객 leg redirect 방식의 answer/pickup이다. 실제 단말의 SIP Answer 명령은 PBX/단말 지원 계약이 없다. | 가능. 단말 제어 방식 또는 AMI 액션 계약 검증 필요 |
| `HoldCall` / `RetrieveCall` | 조건부 제공 | PBX feature code 설정이 필요하다. | 가능. 이미 feature code 기반 제공 |

## 외부 연동 체크리스트

- `POST /auth/login`으로 access/refresh token 발급 확인
- `GET /me/session`으로 `agent.extension`, `callControlCapabilities`, `callCapabilities` 확인
- Socket.IO `/ws` 연결 후 `call.created`, `call.updated`, `call.ended` 수신 확인
- 외부 발신은 `/client/call-commands/originate`와 필수 command headers 사용
- 통화 제어 응답은 `accepted`까지만 신뢰하고, 최종 상태는 실시간 이벤트 또는 조회 API로 확인
- DND는 큐 pause 방식임을 운영자에게 고지
- 내선 착신전환과 3자 회의가 필요하면 별도 PBX/DB 확장 범위로 산정
