# Call Control State Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 통화 제어 UI 상태가 REST command ack만으로 확정되지 않고 서버 이벤트 기준으로 동기화되게 한다.

**Architecture:** 서버가 즉시 확정 가능한 mute 상태는 `call.updated` 이벤트로 tenant 범위에 발행한다. hold/resume은 PBX 후속 Hold/Unhold 이벤트가 `call.updated`를 만들기 때문에 클라이언트는 REST ack 후 상태를 확정하지 않는다.

**Tech Stack:** NestJS, Redis, Socket.IO, React/Zustand, Electron/Zustand, Jest, Vitest.

---

## Task 1: mute 서버 상태 이벤트

- [x] `CallsService.mute()`가 Redis mute state 저장 후 `REALTIME_EVENTS.CALL_UPDATED`를 tenant 범위로 발행한다.
- [x] realtime payload에서 `callLegs`는 제외하고 `isMuted`만 추가한다.
- [x] `calls-service.integration.spec.ts`에서 `ami.command.mute.requested`와 `call.updated` tenant scope를 검증한다.

## Task 2: hold/resume 클라이언트 확정 제거

- [x] 상담원 웹 앱은 이미 hold/resume ack 후 상태를 확정하지 않고 알림만 남긴다.
- [x] 데스크톱 앱도 hold/resume ack 후 `HOLD`/`TALKING`을 직접 확정하지 않는다.
- [x] 데스크톱 store test에서 PBX 이벤트 전까지 상태가 유지되는지 검증한다.

## Task 3: 남은 후속 작업

- [x] transfer는 서버가 `TRANSFERRING`으로 갱신한 세션을 tenant 범위 `call.updated`로 발행한다.
- [x] web/desktop hangup은 REST ack 후 종료 상태를 확정하지 않고 PBX `call.ended` 이벤트를 기다린다.
- [ ] mute off/on 이벤트에 대한 웹/데스크톱 중복 이벤트 처리 UX를 확인한다.
- [ ] 실제 PBX Hold/Unhold 이벤트가 서버 `call.updated`로 내려오는지 실환경에서 검증한다.
