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

- [x] **Step 2: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-05-20-pbx-m3-operations-automation.md apps/server
git commit -m "feat: add PBX M3 holiday rule foundation"
```

Completed in commit `1a33435`.

### Task 4: 관리자 공휴일 설정 화면 연결

**Files:**
- Modify: `apps/server/src/common/menu-permission.service.ts`
- Modify: `apps/admin/src/shared/permissions/menuConfig.tsx`
- Modify: `apps/admin/src/app/router.tsx`
- Create: `apps/admin/src/features/holiday-settings/holidayRules.ts`
- Create: `apps/admin/src/features/holiday-settings/holidayRulesApi.ts`
- Create: `apps/admin/src/features/holiday-settings/HolidaySettingsPage.tsx`
- Test: `apps/server/src/common/menu-permission.service.spec.ts`
- Test: `apps/admin/src/shared/permissions/menuConfig.test.tsx`
- Test: `apps/admin/src/features/holiday-settings/holidayRules.test.ts`

- [x] **Step 1: Write RED tests**

`settings/holidays` 메뉴 권한, 관리자 메뉴 노출, 날짜/범위 표시 헬퍼를 검증한다.

- [x] **Step 2: Run RED**

Run:

```bash
cd apps/server && npx jest src/common/menu-permission.service.spec.ts --runInBand
cd apps/admin && npx vitest run src/shared/permissions/menuConfig.test.tsx src/features/holiday-settings/holidayRules.test.ts
```

- [x] **Step 3: Implement UI wiring**

권한 키, 관리자 메뉴/라우트, 공휴일 규칙 목록/등록/수정/삭제 화면을 추가한다.

- [x] **Step 4: Run targeted GREEN**

Run:

```bash
cd apps/server && npx jest src/common/menu-permission.service.spec.ts --runInBand
cd apps/admin && npx vitest run src/shared/permissions/menuConfig.test.tsx src/features/holiday-settings/holidayRules.test.ts
```

- [x] **Step 5: Run full regression and commit**

Run:

```bash
cd apps/server && npx jest --runInBand && npm run build
cd apps/admin && npx vitest run && npm run build
git add docs/superpowers/plans/2026-05-20-pbx-m3-operations-automation.md apps/server apps/admin
git commit -m "feat: add PBX M3 holiday settings UI"
```

Verification completed:
- `cd apps/server && npx jest --runInBand` → 42 suites / 239 tests PASS
- `cd apps/admin && npx vitest run` → 31 files / 98 tests PASS
- `cd apps/server && npm run build` → PASS
- `cd apps/admin && npm run build` → PASS
- `http://127.0.0.1:5174/settings/holidays` → HTTP 200 SPA shell 확인

### Task 5: M3 마감 갭 감사와 PBX 렌더링 연결

**Files:**
- Modify: `apps/server/src/modules/asterisk-config/renderers/dialplan.renderer.ts`
- Modify: `apps/server/src/modules/asterisk-config/renderers/dialplan.renderer.spec.ts`
- Modify: `apps/server/src/modules/asterisk-config/asterisk-reload.service.ts`
- Modify: `apps/server/src/modules/asterisk-config/asterisk-reload.service.spec.ts`
- Modify: `docs/design/pbx-selected-features-development-plan-20260514.md`

- [x] **Step 1: M3 remaining gap audit**

상위 로드맵의 미체크 항목을 코드 기준으로 재확인했다.

- `시간별 동작`: `asteriskForwardingRules.scheduleJson`과 `GotoIfTime` 렌더링, 자정 교차 시간대 분할 테스트가 이미 존재하므로 착신전환 조건 확장으로 충족.
- `공휴일 지정`: CRUD/UI는 완료됐지만 PBX 렌더러 입력에는 연결되지 않은 갭 확인.
- `국선 그룹`: 다중 국선 풀/장애 우회/발신 라우팅 필요성이 아직 확정되지 않아 스키마/렌더러 구현 없이 보류 확정.

- [x] **Step 2: Write RED tests**

공휴일 날짜가 업무시간 조건보다 먼저 착신전환 라우트로 진입하고, reload 서비스가 `tenantHolidayRules`와 DID 지사 정보를 렌더러에 전달하는지 검증한다.

- [x] **Step 3: Run RED**

Run:

```bash
cd apps/server && npx jest src/modules/asterisk-config/renderers/dialplan.renderer.spec.ts --runInBand
cd apps/server && npx jest src/modules/asterisk-config/asterisk-reload.service.spec.ts --runInBand
```

Observed:
- `DidInput.branchId` / `holidayRules` 렌더링 계약 없음
- `tenantHolidayRules.findMany` 호출 없음

- [x] **Step 4: Implement PBX holiday routing**

`renderDialplan` 입력에 `holidayRules`를 추가하고, DID의 활성 지사 기준으로 `WORKDAY_OVERRIDE` → 휴일 규칙 순서의 날짜 검사를 생성한다. reload 서비스는 활성 공휴일 규칙과 DID의 대표 지사를 함께 렌더러에 전달한다.

- [x] **Step 5: Run targeted GREEN**

Run:

```bash
cd apps/server && npx jest src/modules/asterisk-config/renderers/dialplan.renderer.spec.ts --runInBand
cd apps/server && npx jest src/modules/asterisk-config/asterisk-reload.service.spec.ts --runInBand
```

Observed:
- `dialplan.renderer.spec.ts` → 30 tests PASS
- `asterisk-reload.service.spec.ts` → 2 tests PASS

- [x] **Step 6: Run full regression and commit**

Run:

```bash
cd apps/server && npx jest --runInBand && npm run build
cd apps/admin && npx vitest run && npm run build
git add docs apps/server apps/admin
git commit -m "feat: complete PBX M3 operations automation"
```

Verification completed:
- `cd apps/server && npx jest --runInBand` → 42 suites / 241 tests PASS
- `cd apps/admin && npx vitest run` → 31 files / 98 tests PASS
- `cd apps/server && npm run build` → PASS
- `cd apps/admin && npm run build` → PASS
