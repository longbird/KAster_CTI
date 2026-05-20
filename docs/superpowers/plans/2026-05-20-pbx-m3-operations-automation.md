# PBX M3 Operations Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** M3 P2의 시간별 동작/공휴일 지정 기반을 만들고, 국선 그룹은 현장 필요성 확인 전까지 스키마 생성 없이 보류한다.

**Architecture:** 기존 착신전환 시간표(`scheduleJson`)는 유지하고, 공휴일/임시영업일은 테넌트 기본과 지사 재정의를 모두 표현하는 `tenantHolidayRules` 테이블로 분리한다. 서버는 공휴일 우선 평가 유틸과 관리자 CRUD API를 제공한다.

**Tech Stack:** NestJS, Prisma, Jest, class-validator.

---

### Task 1: 공휴일 평가 유틸

**Files:**
- Create: `apps/server/src/modules/admin/holiday-rules.util.ts`
- Test: `apps/server/test/holiday-rules.util.spec.ts`

- [x] **Step 1: Write RED test**

공휴일 규칙이 업무시간보다 먼저 적용되고, 지사별 임시 영업일이 테넌트 기본 휴일보다 우선하는지 검증한다.

- [x] **Step 2: Run RED**

Run: `cd apps/server && npx jest test/holiday-rules.util.spec.ts --runInBand`

- [x] **Step 3: Implement util**

`resolveHolidayDecision(rules, { date, branchId })`를 추가한다. 우선순위는 `branch WORKDAY_OVERRIDE` → `branch holiday` → `tenant WORKDAY_OVERRIDE` → `tenant holiday` → normal workday.

- [x] **Step 4: Run GREEN**

Run: `cd apps/server && npx jest test/holiday-rules.util.spec.ts --runInBand`

### Task 2: 공휴일 스키마와 관리자 API

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/migrations/20260520_holiday_rules/migration.sql`
- Create: `apps/server/src/modules/admin/dto/holiday-rule.dto.ts`
- Modify: `apps/server/src/modules/admin/admin.service.ts`
- Modify: `apps/server/src/modules/admin/admin.controller.ts`
- Test: `apps/server/test/admin.service.holiday-rules.spec.ts`

- [x] **Step 1: Write RED test**

관리자 서비스가 테넌트 기본/지사별 공휴일을 목록화하고 생성/수정/삭제할 수 있는지 검증한다.

- [x] **Step 2: Run RED**

Run: `cd apps/server && npx jest test/admin.service.holiday-rules.spec.ts --runInBand`

- [x] **Step 3: Implement schema/API**

`tenantHolidayRules` 모델을 추가한다. CRUD는 `settings/branches` 권한을 사용한다.

- [x] **Step 4: Run GREEN**

Run: `cd apps/server && npx jest test/admin.service.holiday-rules.spec.ts --runInBand`

### Task 3: Verification and Commit

- [x] **Step 1: Run server regression**

Run: `cd apps/server && npx jest --runInBand && npm run build`

- [ ] **Step 2: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-05-20-pbx-m3-operations-automation.md apps/server
git commit -m "feat: add PBX M3 holiday rule foundation"
```
