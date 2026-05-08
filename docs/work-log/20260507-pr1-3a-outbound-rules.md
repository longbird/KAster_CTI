# PR1-3A — 아웃바운드 발신번호 룰 (CRUD / API / UI)

> BlueSky `Outbound`(orgNumber → outboundNumber + name + memo) 등가물.
> plan: `~/.claude/plans/8-temporal-gray.md` PR 1-3, 체크포인트 A.

## 변경 요약

발신 시 입력 번호(또는 내선/지사 컨텍스트)에 따라 callerId 를 변환하는 룰을 등록·관리할 수 있게 한다. 본 PR 은 **저장·조회·매칭 미리보기까지만**. dialplan 반영은 별도 follow-up(PR1-3B)에서 한다.

## DB 변경

- 신규 enum `OutboundCallerIdMatchType`: `EXACT | PREFIX | REGEX | DIALPLAN_PATTERN`. API/sanitizer/dialplan 가 동일한 단일 진실원으로 사용.
- 신규 테이블 `outboundCallerIdRules`:
  - PK `outboundCallerIdRuleId UUID`
  - `tenantId UUID`, `branchId UUID?` (nullable — 전역 룰 표현)
  - `matchType` enum, `sourceNumberPattern VARCHAR(64)`
  - `callerIdNumber VARCHAR(32)`, `displayName VARCHAR(64)?`
  - `memo TEXT?`, `priority INT DEFAULT 0`, `enabled BOOL DEFAULT TRUE`
  - `INDEX(tenantId, branchId, priority)`, `INDEX(tenantId, enabled)`
  - FK: tenant CASCADE, branch SET NULL.
- 마이그레이션: `apps/server/prisma/migrations/20260507_outbound_caller_id_rules/migration.sql`.

## 서버

### 입력 검증 — 화이트리스트 이중화
`apps/server/src/common/outbound-rule.sanitizer.ts` 신설.
- `validateSourceNumberPattern(matchType, pattern)`:
  - `EXACT/PREFIX`: `^[0-9+]{1,20}$`
  - `REGEX`: 길이 ≤ 200 + `new RegExp(value, 'u')` 컴파일 가능 여부
  - `DIALPLAN_PATTERN`: `^_[0-9NXZ.\[\]\-]{1,32}$`
  - 모든 타입에 개행 차단(`assertNoNewlines` 강화).
- `validateCallerIdNumber`: `^[0-9+]{1,20}$` (dialplan 안전).
- `validateDisplayName`: `^[\w\s.\-가-힣]{0,40}$` + 개행 차단 (한글 표시명 허용).
- `matchSourceNumber`: 서버 측 매칭 평가기 (룰 테스트 endpoint 가 사용). Asterisk 패턴(`_NXX`, `_010.`, `[set]`, `Z`) 단순 매처 포함.
- DTO 1차 검증 + service 진입 시 sanitizer 재검증으로 이중화.

### 신규 모듈 `apps/server/src/modules/outbound-rules/`
- DTO: `create-outbound-rule.dto.ts`, `update-outbound-rule.dto.ts`, `test-outbound-rule.dto.ts`.
- Service: `OutboundRulesService.{list, create, update, remove, test}` — Prisma `(this.prisma as any).outboundCallerIdRules` 사용. 단순 CRUD + 테스트.
- Controller: `@Controller('admin/settings/outbound-rules')`, `@Roles('supervisor','admin')`.
- Endpoint:
  - `GET    /admin/settings/outbound-rules`
  - `POST   /admin/settings/outbound-rules` (create)
  - `POST   /admin/settings/outbound-rules/:ruleId` (update — announcements 패턴 준수)
  - `POST   /admin/settings/outbound-rules/test` (입력 번호 → 매칭 미리보기)
  - `DELETE /admin/settings/outbound-rules/:ruleId`
- `OutboundRulesModule` 을 `app.module.ts` 에 등록.

### 메뉴 키 등록
- `apps/server/src/common/menu-permission.service.ts` 의 `MENU_KEYS` + `MUTABLE_MENU_KEYS` 에 `'settings/outbound-rules'` 추가. 기본 권한 자동 생성.

## 프론트

- `apps/admin/src/features/outbound-rules/OutboundRulesPage.tsx`:
  - 룰 목록 Antd Table (지사/매칭방식/입력 패턴/발신ID/표시명/우선순위/사용 컬럼).
  - 등록/수정 Modal — matchType 별 동적 검증(서버 sanitizer 와 동일한 패턴 + REGEX 컴파일 시도).
  - 룰 테스트 Modal — 입력 번호 → `/admin/settings/outbound-rules/test` 호출 → 매칭 winner + candidates 표시.
- 라우트 `/settings/outbound-rules`, 메뉴 "운영 설정 > 아웃바운드 발신번호".

## 검증 결과

| 항목 | 결과 |
|---|---|
| `npx prisma generate` | ✅ Prisma Client 재생성 |
| `npx tsc --noEmit` (server) | ✅ exit=0 |
| `npx tsc -b` (admin) | ✅ exit=0 |
| `jest menu-permission|outbound-rule` | ✅ 2 suites, 20 tests PASS (sanitizer 15 + menu-permission 5) |
| dev DB 마이그레이션 적용 | ⏳ 사용자 측 수동 검증 |

### sanitizer 단위 테스트 커버리지
- matchType 별 패턴 화이트리스트 검증 (EXACT/PREFIX/REGEX/DIALPLAN_PATTERN)
- callerIdNumber 화이트리스트
- displayName 한글/ASCII 허용 + 개행/특수문자 차단
- matchSourceNumber 4 종 매칭 동작 (EXACT/PREFIX/REGEX/Asterisk pattern)
- REGEX 컴파일 실패 시 422
- REGEX 200자 초과 거부

## 주의 / Open Items

- **PBX 미반영**: 본 PR 머지 후 화면은 동작하지만 dialplan 은 여전히 단일 `defaultOutboundCallerId` 만 사용한다. 운영 인수인계 시 명시 필요.
- 룰이 비활성/없을 때 fallback: `tenantSystemSettings.defaultOutboundCallerId` 가 그대로 사용되도록 PR1-3B 에서 처리.
- 우선순위 충돌: 동일 priority 인 룰은 `createdAt asc` 순으로 평가 (test endpoint 와 동일 기준).

## 후속 의존성

- **PR1-3B (체크포인트 B)**: `agent-dialplan.renderer.ts:45` 룰 기반 매핑 확장 + snapshot/spec 갱신.
- 권한 복사 PR2-2 의 `outboundCallerIdOverride` 옵션 scope 가 본 테이블을 대상으로 하지 않는다는 점은 plan 에 명시되어 있음 (전역/지사 레벨이라 무차별 복사 위험).

## 변경 파일 목록

### 신규
- `apps/server/prisma/migrations/20260507_outbound_caller_id_rules/migration.sql`
- `apps/server/src/common/outbound-rule.sanitizer.ts`
- `apps/server/src/common/outbound-rule.sanitizer.spec.ts`
- `apps/server/src/modules/outbound-rules/outbound-rules.module.ts`
- `apps/server/src/modules/outbound-rules/outbound-rules.service.ts`
- `apps/server/src/modules/outbound-rules/outbound-rules.controller.ts`
- `apps/server/src/modules/outbound-rules/dto/create-outbound-rule.dto.ts`
- `apps/server/src/modules/outbound-rules/dto/update-outbound-rule.dto.ts`
- `apps/server/src/modules/outbound-rules/dto/test-outbound-rule.dto.ts`
- `apps/admin/src/features/outbound-rules/OutboundRulesPage.tsx`

### 수정
- `apps/server/prisma/schema.prisma` (enum + 신규 모델 + relations)
- `apps/server/src/app.module.ts` (OutboundRulesModule 등록)
- `apps/server/src/common/menu-permission.service.ts` (`settings/outbound-rules` MENU_KEYS + MUTABLE_MENU_KEYS)
- `apps/server/src/common/menu-permission.service.spec.ts` (신규 테스트 케이스)
- `apps/admin/src/app/router.tsx` (라우트)
- `apps/admin/src/shared/permissions/menuConfig.tsx` (메뉴)
