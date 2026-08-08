# PBX M2 Conditional Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

> **Completion reconciliation (2026-05-22):** 마지막 `Commit` 체크 표기가 누락되어 있었으나 구현, 전체 회귀 테스트, 커밋은 완료된 상태다. 최신 상위 계획서와 현재 코드 기준으로 완료 상태로 정리했다.

**Goal:** M2 P1의 확정 구현 범위인 가상버퍼 상태 표시와 상담원 그룹 기반 분배 대상 편집을 완료한다.

**Architecture:** 서버는 기존 `/queues/summary` 응답에 `callSessions.sessionStatus = 'QUEUED'` 기반 가상버퍼 상태를 추가한다. 관리자 앱은 큐 현황/호 분배룰 설정 화면에서 그 상태를 표시하고, 호 분배룰 생성/수정 모달은 기존 `agentGroups`, `agents.agentGroupId`, `queueAgentMembers` 조합으로 상담원 그룹 단위 추가를 제공한다.

**Tech Stack:** NestJS, Prisma, Jest, Vite, React, Ant Design, Vitest.

---

### Task 1: 서버 큐 요약에 가상버퍼 상태 추가

**Files:**
- Modify: `apps/server/src/modules/queues/queues.service.ts`
- Test: `apps/server/test/queues.service.spec.ts`

- [x] **Step 1: Write the failing test**

`QueuesService.getSummary()`가 큐의 `maxWaitSeconds`와 대기 중인 `callSessions`를 사용해 아래 형태를 반환하는지 검증한다.

```ts
expect(row.virtualBuffer).toEqual({
  waitingCalls: 2,
  longestWaitSeconds: 70,
  overThresholdCalls: 1,
  status: 'OVER_THRESHOLD',
});
```

- [x] **Step 2: Run RED**

Run: `cd apps/server && npx jest test/queues.service.spec.ts --runInBand`

Expected: `virtualBuffer` 필드가 없어 실패한다.

- [x] **Step 3: Implement minimal server change**

`queues.findMany` select에 `maxWaitSeconds`를 포함하고, 큐별로 `QUEUED` 세션 중 `queuedAt <= now - maxWaitSeconds`인 건수를 계산한다. `waiting = 0`이면 `EMPTY`, 초과 건수가 있으면 `OVER_THRESHOLD`, 그 외에는 `WAITING`으로 반환한다.

- [x] **Step 4: Run GREEN**

Run: `cd apps/server && npx jest test/queues.service.spec.ts --runInBand`

Expected: PASS.

### Task 2: 관리자 큐 현황/설정 화면에 가상버퍼 표시

**Files:**
- Modify: `apps/admin/src/features/dashboard/api/dashboardApi.ts`
- Modify: `apps/admin/src/features/dashboard/types/dashboard.ts`
- Modify: `apps/admin/src/features/dashboard/components/QueueSummaryTable.tsx`
- Modify: `apps/admin/src/pages/QueuesPage.tsx`
- Modify: `apps/admin/src/features/queue-settings/QueueSettingsPage.tsx`
- Test: `apps/admin/src/features/dashboard/api/dashboardApi.test.ts`
- Test: `apps/admin/src/features/dashboard/components/QueueSummaryTable.test.tsx`

- [x] **Step 1: Write failing tests**

`mapDashboardPayload()`가 서버의 `virtualBuffer.overThresholdCalls`를 `slaBreached`에 매핑하고, `QueueSummaryTable`이 `가상버퍼` 열을 렌더링하는지 검증한다.

- [x] **Step 2: Run RED**

Run: `cd apps/admin && npx vitest run src/features/dashboard/api/dashboardApi.test.ts src/features/dashboard/components/QueueSummaryTable.test.tsx`

Expected: `slaBreached` 값 또는 `가상버퍼` 열 부재로 실패한다.

- [x] **Step 3: Implement UI mapping/display**

큐 요약 타입에 `virtualBuffer`를 추가한다. 큐 현황과 호 분배룰 설정 화면에서 `가상버퍼` 열은 `대기 n / 초과 m` 형태로 표시하고 초과가 있으면 오류 색상 태그를 사용한다.

- [x] **Step 4: Run GREEN**

Run: `cd apps/admin && npx vitest run src/features/dashboard/api/dashboardApi.test.ts src/features/dashboard/components/QueueSummaryTable.test.tsx`

Expected: PASS.

### Task 3: 호 분배룰 대상 편집에 실제 상담원 그룹 사용

**Files:**
- Create: `apps/admin/src/features/queue-settings/queueMemberGroups.ts`
- Test: `apps/admin/src/features/queue-settings/queueMemberGroups.test.ts`
- Modify: `apps/admin/src/features/queue-settings/QueueCreateModal.tsx`
- Modify: `apps/admin/src/features/queue-settings/QueueEditModal.tsx`
- Modify: `apps/server/src/modules/queues/queues.service.ts`

- [x] **Step 1: Write failing helper tests**

`getAgentGroupLabel()`은 `agent.agentGroup.groupName`을 우선 사용하고, `appendGroupMembers()`는 선택 그룹의 미배정 상담원만 순서대로 추가하는지 검증한다.

- [x] **Step 2: Run RED**

Run: `cd apps/admin && npx vitest run src/features/queue-settings/queueMemberGroups.test.ts`

Expected: 헬퍼 파일이 없어 실패한다.

- [x] **Step 3: Implement helper and wire modals**

생성/수정 모달은 `/admin/settings/agent-groups`를 함께 조회한다. `그룹 조회` 필터는 `agentGroupId`를 기준으로 동작하고, `그룹 추가` 버튼은 선택 그룹의 상담원을 분배 대상에 일괄 추가한다. 서버 `listMembers()`는 멤버 상담원의 `agentGroupId`, `agentGroup`을 포함한다.

- [x] **Step 4: Run GREEN**

Run: `cd apps/admin && npx vitest run src/features/queue-settings/queueMemberGroups.test.ts`

Expected: PASS.

### Task 4: Full Verification

**Files:**
- All modified files above.

- [x] **Step 1: Run targeted tests**

Run:

```bash
cd apps/server && npx jest test/queues.service.spec.ts --runInBand
cd apps/admin && npx vitest run src/features/dashboard/api/dashboardApi.test.ts src/features/dashboard/components/QueueSummaryTable.test.tsx src/features/queue-settings/queueMemberGroups.test.ts
```

- [x] **Step 2: Run full regression for touched apps**

Run:

```bash
cd apps/server && npx jest --runInBand
cd apps/admin && npx vitest run
cd apps/server && npm run build
cd apps/admin && npm run build
```

- [x] **Step 3: Commit**

```bash
git add docs/plans/2026-05-20-pbx-m2-conditional-operations.md apps/server apps/admin
git commit -m "feat: add PBX M2 queue buffer and group distribution"
```
