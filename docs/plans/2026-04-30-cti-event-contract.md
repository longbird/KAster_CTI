# CTI Event Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서버, 상담원 웹 앱, 관리자 앱, Windows 데스크톱 앱이 같은 CTI 실시간 이벤트 계약을 사용하도록 기준 문서와 코드 상수를 고정한다.

**Architecture:** 1차 범위는 이벤트 계약의 기준선을 만드는 작업이다. 서버에는 이벤트 이름 상수를 두고, 문서에는 서버 생산 이벤트와 클라이언트 소비 이벤트의 payload/발생 조건/보정 조회 기준을 기록한다. 이후 통화 제어 상태 동기화와 관리자 WebSocket 전환은 이 계약을 기준으로 별도 작업한다.

**Tech Stack:** NestJS, Socket.IO, React, Electron, TypeScript, Jest, Vitest.

---

## File Structure

- Create: `docs/design/cti-event-contract.md`
  - 운영/개발자가 공유하는 CTI 실시간 이벤트 계약 문서.
- Create: `apps/server/src/modules/realtime/realtime-events.ts`
  - 서버에서 발행하는 이벤트 이름 상수와 타입 유니언.
- Modify: `apps/server/src/modules/outbox/outbox-publisher.service.ts`
  - `call.*`, `screenpop.customer`, `queue.summary.updated` 문자열을 상수로 교체.
- Modify: `apps/server/src/modules/calls/agent-state.service.ts`
  - `agent.status.changed`, `queue.summary.updated` 문자열을 상수로 교체.
- Modify: `apps/server/src/modules/auth/auth.service.ts`
  - login/logout 흐름의 `agent.status.changed`, `queue.summary.updated` 문자열을 상수로 교체.
- Modify: `apps/server/src/modules/calls/session-engine.service.ts`
  - call outbox event type 문자열을 상수로 교체.
- Create: `apps/server/src/modules/realtime/realtime-events.spec.ts`
  - 서버 이벤트 상수의 이름 고정 테스트.
- Modify: `apps/web/src/ws/realSocket.ts`
  - 상담원 웹 앱의 구독 이벤트 배열을 명시적으로 고정.
- Modify: `apps/desktop/src/main/cti-runtime.ts`
  - 데스크톱 앱의 구독 이벤트에 `screenpop.customer`를 포함.
- Modify: `apps/desktop/src/main/cti-runtime.test.ts`
  - 데스크톱 런타임이 모든 계약 이벤트를 구독하는지 검증.

---

### Task 1: 서버 이벤트 이름 상수와 계약 문서 기준선

**Files:**
- Create: `apps/server/src/modules/realtime/realtime-events.ts`
- Create: `apps/server/src/modules/realtime/realtime-events.spec.ts`
- Create: `docs/design/cti-event-contract.md`

- [ ] **Step 1: Add server realtime event constants**

Create `apps/server/src/modules/realtime/realtime-events.ts`:

```ts
export const REALTIME_EVENTS = {
  CALL_CREATED: 'call.created',
  CALL_UPDATED: 'call.updated',
  CALL_ENDED: 'call.ended',
  SCREENPOP_CUSTOMER: 'screenpop.customer',
  AGENT_STATUS_CHANGED: 'agent.status.changed',
  QUEUE_SUMMARY_UPDATED: 'queue.summary.updated',
} as const;

export type RealtimeEventName =
  (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

export const CALL_SESSION_REALTIME_EVENTS = [
  REALTIME_EVENTS.CALL_CREATED,
  REALTIME_EVENTS.CALL_UPDATED,
  REALTIME_EVENTS.CALL_ENDED,
] as const;
```

- [ ] **Step 2: Add a name-stability test**

Create `apps/server/src/modules/realtime/realtime-events.spec.ts`:

```ts
import { CALL_SESSION_REALTIME_EVENTS, REALTIME_EVENTS } from './realtime-events';

describe('REALTIME_EVENTS', () => {
  it('keeps public Socket.IO event names stable', () => {
    expect(REALTIME_EVENTS).toEqual({
      CALL_CREATED: 'call.created',
      CALL_UPDATED: 'call.updated',
      CALL_ENDED: 'call.ended',
      SCREENPOP_CUSTOMER: 'screenpop.customer',
      AGENT_STATUS_CHANGED: 'agent.status.changed',
      QUEUE_SUMMARY_UPDATED: 'queue.summary.updated',
    });
  });

  it('lists call session lifecycle events in the event contract order', () => {
    expect(CALL_SESSION_REALTIME_EVENTS).toEqual([
      'call.created',
      'call.updated',
      'call.ended',
    ]);
  });
});
```

- [ ] **Step 3: Write the event contract document**

Create `docs/design/cti-event-contract.md` with these sections:

```markdown
# CTI 실시간 이벤트 계약

작성일: 2026-04-30
기준 계획서: `docs/plans/project-integrated-plan.md`

## 범위

이 문서는 CTI 서버가 Socket.IO `/ws` namespace로 발행하는 운영 이벤트와 클라이언트가 구독해야 하는 이벤트를 고정한다.

## 공통 전송 기준

- namespace: `/ws`
- 인증: Socket.IO `auth.token` 또는 `query.token`의 JWT
- envelope: WebSocket 이벤트는 REST envelope을 쓰지 않고 이벤트 이름과 payload를 직접 전달한다.
- REST 보정: 재연결, 이벤트 누락, 화면 최초 진입은 REST 조회로 현재 상태를 보정한다.

## 이벤트 목록

| 이벤트 | 생산자 | 주요 소비자 | payload | 발생 조건 | REST 보정 |
| --- | --- | --- | --- | --- | --- |
| `call.created` | CTI 서버 outbox | 상담원 웹, 관리자 앱, 데스크톱 앱 | active call | 신규 통화 세션 생성 | `GET /calls/active` |
| `call.updated` | CTI 서버 outbox | 상담원 웹, 관리자 앱, 데스크톱 앱 | active call | 통화 상태 변경 | `GET /calls/:callId`, `GET /calls/active` |
| `call.ended` | CTI 서버 outbox | 상담원 웹, 관리자 앱, 데스크톱 앱 | `{ callId, endedAt, talkSeconds }` | 통화 종료 | `GET /calls/:callId` |
| `screenpop.customer` | CTI 서버 outbox enrichment | 상담원 웹, 데스크톱 앱 | `{ callId, customer }` | 신규 통화와 고객 매칭 성공 | 고객 상세 API |
| `agent.status.changed` | 인증/상태 변경 서비스 | 상담원 웹, 관리자 앱, 데스크톱 앱 | `{ agentId, statusCode, reasonCode }` | 로그인 또는 상태 변경 | `GET /me/session`, `GET /agents` |
| `queue.summary.updated` | 상태 변경/outbox | 상담원 웹, 관리자 앱, 데스크톱 앱 | queue summary array | 통화/상담원 상태가 큐 요약에 영향 | `GET /queues/summary` |

## 구현 순서

1. 서버 이벤트 이름 상수화
2. 클라이언트 구독 이벤트 목록 정합화
3. payload 타입 차이 제거
4. 관리자 앱 WebSocket 소비 추가
5. 테스트 앱에서 WebSocket 이벤트 검증 추가
```

- [ ] **Step 4: Run server test for the new contract file**

Run:

```bash
cd apps/server
npm test -- realtime-events.spec.ts
```

Expected: PASS.

---

### Task 2: 서버 이벤트 발행 문자열 상수화

**Files:**
- Modify: `apps/server/src/modules/outbox/outbox-publisher.service.ts`
- Modify: `apps/server/src/modules/calls/agent-state.service.ts`
- Modify: `apps/server/src/modules/auth/auth.service.ts`
- Modify: `apps/server/src/modules/calls/session-engine.service.ts`

- [ ] **Step 1: Replace outbox publisher event names**

Import:

```ts
import { REALTIME_EVENTS } from '../realtime/realtime-events';
```

Replace these string literals:

```ts
'screenpop.customer' -> REALTIME_EVENTS.SCREENPOP_CUSTOMER
'call.created' -> REALTIME_EVENTS.CALL_CREATED
'call.updated' -> REALTIME_EVENTS.CALL_UPDATED
'call.ended' -> REALTIME_EVENTS.CALL_ENDED
'queue.summary.updated' -> REALTIME_EVENTS.QUEUE_SUMMARY_UPDATED
```

- [ ] **Step 2: Replace agent state event names**

Import:

```ts
import { REALTIME_EVENTS } from '../realtime/realtime-events';
```

Use:

```ts
await this.eventBus.publish(REALTIME_EVENTS.AGENT_STATUS_CHANGED, {
  agentId,
  statusCode,
  reasonCode: reasonCode ?? null,
});

await this.eventBus.publish(
  REALTIME_EVENTS.QUEUE_SUMMARY_UPDATED,
  toRealtimeQueueSummary(queueSummary.data?.queues ?? []),
);
```

- [ ] **Step 3: Replace auth service event names**

Import:

```ts
import { REALTIME_EVENTS } from '../realtime/realtime-events';
```

Use `REALTIME_EVENTS.AGENT_STATUS_CHANGED` and `REALTIME_EVENTS.QUEUE_SUMMARY_UPDATED` for login/logout event publication.

- [ ] **Step 4: Replace session engine outbox event names**

Import:

```ts
import { REALTIME_EVENTS } from '../realtime/realtime-events';
```

Use:

```ts
await this.enqueueOutbox(tx, tenantId, REALTIME_EVENTS.CALL_CREATED, created);
await this.enqueueOutbox(tx, tenantId, REALTIME_EVENTS.CALL_UPDATED, updated);
await this.enqueueOutbox(tx, tenantId, REALTIME_EVENTS.CALL_ENDED, updated);
```

Search after modification:

```bash
rg -n "'call\\.created'|'call\\.updated'|'call\\.ended'|'screenpop\\.customer'|'agent\\.status\\.changed'|'queue\\.summary\\.updated'" apps/server/src
```

Expected: only `realtime-events.ts`, `realtime-events.spec.ts`, or tests/docs references remain.

- [ ] **Step 5: Run server tests**

Run:

```bash
cd apps/server
npm test -- realtime-events.spec.ts
```

Expected: PASS.

---

### Task 3: 클라이언트 구독 목록 정합화

**Files:**
- Modify: `apps/web/src/ws/realSocket.ts`
- Modify: `apps/desktop/src/main/cti-runtime.ts`
- Modify: `apps/desktop/src/main/cti-runtime.test.ts`

- [ ] **Step 1: Make web subscription list explicit**

In `apps/web/src/ws/realSocket.ts`, replace repeated `bind(...)` calls with:

```ts
const REALTIME_EVENT_NAMES: CtiEvent['type'][] = [
  'call.created',
  'call.updated',
  'call.ended',
  'screenpop.customer',
  'agent.status.changed',
  'queue.summary.updated',
];

REALTIME_EVENT_NAMES.forEach(bind);
```

- [ ] **Step 2: Add desktop screen pop subscription**

In `apps/desktop/src/main/cti-runtime.ts`, update `EVENT_NAMES`:

```ts
const EVENT_NAMES: RuntimeEventName[] = [
  'call.created',
  'call.updated',
  'call.ended',
  'screenpop.customer',
  'agent.status.changed',
  'queue.summary.updated',
];
```

- [ ] **Step 3: Update desktop runtime test**

In `apps/desktop/src/main/cti-runtime.test.ts`, add:

```ts
expect(socketOn).toHaveBeenCalledWith('screenpop.customer', expect.any(Function));
```

- [ ] **Step 4: Run client tests**

Run:

```bash
cd apps/desktop
npm test -- cti-runtime.test.ts
```

Expected: PASS.

---

### Task 4: 검증과 후속 작업 분리

**Files:**
- Modify: `docs/design/cti-event-contract.md`
- Modify: `docs/plans/project-next-tasks.md`

- [ ] **Step 1: Add current mismatch notes**

Add a "현재 차이와 후속 작업" section to `docs/design/cti-event-contract.md`:

```markdown
## 현재 차이와 후속 작업

- 관리자 앱은 아직 WebSocket 소비가 명확히 연결되어 있지 않다. 관리자 실시간 화면 전환 작업에서 `call.*`, `agent.status.changed`, `queue.summary.updated`를 소비하게 한다.
- `screenpop.customer`는 고객 매칭이 있을 때만 발행된다. 고객 미매칭 인입은 `call.created`의 `customer: null`로 처리한다.
- 통화 제어 상태의 최종 성공/실패 판정은 이 문서의 다음 단계인 통화 제어 상태 서버 동기화에서 확정한다.
```

- [ ] **Step 2: Mark the first task started in next-task document**

In `docs/plans/project-next-tasks.md`, under `## 1. P0: 실시간 이벤트 계약 정합화`, add:

```markdown
현재 착수 산출물:

- `docs/plans/2026-04-30-cti-event-contract.md`
- `docs/design/cti-event-contract.md`
- `apps/server/src/modules/realtime/realtime-events.ts`
```

- [ ] **Step 3: Run final targeted checks**

Run:

```bash
cd apps/server
npm test -- realtime-events.spec.ts
```

Run:

```bash
cd apps/desktop
npm test -- cti-runtime.test.ts
```

Expected: both PASS.

---

## Self-Review

- Spec coverage: P0-1의 서버 생산 이벤트 목록, 클라이언트 소비 이벤트, mock/real 정합화의 기준선까지 포함한다. 관리자 앱 WebSocket 전환과 통화 제어 상태 저장은 후속 P0 작업으로 분리한다.
- Placeholder scan: 이 계획에는 TBD/TODO/나중에 같은 미정 항목이 없다.
- Type consistency: 이벤트 이름은 `REALTIME_EVENTS`와 클라이언트 `CtiEvent['type']` 기준으로 맞춘다.
