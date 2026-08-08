# Realtime Event Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CTI 실시간 이벤트가 다른 tenant 또는 다른 상담원 화면에 잘못 반영되는 위험을 줄인다.

**Architecture:** 서버는 Socket.IO 연결을 tenant room에 join시키고 `EventBusService.publish()`에 optional `tenantId`를 전달해 tenant 범위 broadcast를 지원한다. 클라이언트는 `agent.status.changed`를 현재 로그인한 agentId와 일치할 때만 자기 상태로 반영한다. 통화 이벤트의 상담원별 필터링은 큐/관리자 화면 요구와 충돌할 수 있어 다음 작업에서 별도 정책으로 확정한다.

**Tech Stack:** NestJS, Socket.IO, Redis Pub/Sub, React/Zustand, Electron/Zustand, Jest, Vitest.

---

## Task 1: 서버 tenant room broadcast

**Files:**
- Modify: `apps/server/src/modules/realtime/realtime.gateway.ts`
- Modify: `apps/server/src/modules/events/event-bus.service.ts`
- Modify: server publishers that know `tenantId`
- Test: `apps/server/src/modules/realtime/realtime.gateway.spec.ts`

Steps:

- [ ] Add `tenant:${tenantId}` room join in `RealtimeGateway.handleConnection()`.
- [ ] Change `RealtimeGateway.broadcast(event, payload, tenantId?)` so tenantId emits to the tenant room and no tenantId keeps current global behavior.
- [ ] Change Redis pub/sub message shape to `{ event, payload, sourceNode, tenantId? }`.
- [ ] Add optional `tenantId` parameter to `EventBusService.publish(event, payload, tenantId?)`.
- [ ] Pass tenantId from known publishers: outbox rows, auth login/logout, agent state change, session recovery.
- [ ] Add gateway unit tests for tenant room join and tenant-scoped broadcast.
- [ ] Run `cd apps/server; npm test -- realtime.gateway.spec.ts realtime-events.spec.ts`.

## Task 2: 클라이언트 agent 상태 필터

**Files:**
- Modify: `apps/web/src/store/useCtiStore.ts`
- Modify: `apps/desktop/src/renderer/src/store/useDesktopStore.ts`
- Test: existing store tests or new focused tests

Steps:

- [ ] In web store, ignore `agent.status.changed` for `agentId` different from `agentSession.agentId`.
- [ ] In desktop store, ignore `agent.status.changed` for `agentId` different from current desktop session agentId.
- [ ] Add focused tests for matching and non-matching agent status events.
- [ ] Run web and desktop store tests.

## Task 3: 문서 업데이트와 검증

**Files:**
- Modify: `docs/design/cti-event-contract.md`
- Modify: `docs/plans/project-next-tasks.md`

Steps:

- [ ] Record that server events are tenant-scoped when tenantId is known.
- [ ] Record that client self status uses agentId filtering.
- [ ] Keep call event 상담원별 필터링 as follow-up policy work.
- [ ] Run targeted server/web/desktop tests and builds.
