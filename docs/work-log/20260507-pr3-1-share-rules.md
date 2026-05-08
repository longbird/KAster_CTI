# PR3-1 — 공유규칙 매트릭스 (지사 × 상담원)

> BlueSky `ShareRule` + `ShareRuleStaff` + `ShareRuleJisa` 등가물. plan: `~/.claude/plans/8-temporal-gray.md` PR 3-1.

## 변경 요약

룰 마스터 + (상담원 / 상담원 그룹) 우선순위 + (지사 + 부속 전화번호) 매트릭스를 저장하는 4 테이블 신설. 고객·지사에 룰 FK 추가. 관리자 CRUD + 매트릭스 편집 Drawer + 고객/지사 폼에 Select 노출까지 구현. **호 분배 실제 반영(PBX 큐 멤버 동기화)은 별도 follow-up PR**.

## DB 변경

마이그레이션: `apps/server/prisma/migrations/20260507_share_rules/migration.sql`

신규 테이블 4개:
- `shareRules` — 마스터 (`ruleCode`, `ruleName`, `description`, `isActive`)
- `shareRuleAgents` — 룰 → 상담원, `priority` Int
- `shareRuleAgentGroups` — 룰 → 상담원 그룹, `priority` Int
- `shareRuleBranches` — 룰 → 지사, 부속 `mainPhone` / `transferPhone`

기존 테이블 컬럼 추가:
- `customers.shareRuleId UUID?` — 고객별 오버라이드 (BlueSky `Cust.shareRuleCD`)
- `branches.defaultShareRuleId UUID?` — 지사 기본 룰

agent / agentGroup 분리 테이블로 둔 이유: Prisma schema 만으로 "둘 중 하나만" 제약을 표현하기 어려움. 우선순위 정렬은 서비스 레이어에서 두 컬렉션을 병합해 정렬.

## 서버

### 신규 모듈
`apps/server/src/modules/share-rules/`
- `share-rules.controller.ts` — `JwtAuthGuard + RolesGuard + @Roles('supervisor','admin')`. 모든 엔드포인트가 `MenuPermissionService.assertMenuAction(..., 'settings/share-rules', ...)` 통과 필요.
- `share-rules.service.ts` — CRUD + 매트릭스 bulk upsert (트랜잭션으로 deleteMany + createMany 패턴).
- DTO: `create-share-rule.dto.ts`, `update-share-rule.dto.ts`, `put-share-rule-agents.dto.ts`, `put-share-rule-branches.dto.ts`.

### Endpoint
- `GET /admin/settings/share-rules` — 룰 목록 (`_count` 포함: agents/agentGroups/branches)
- `GET /admin/settings/share-rules/:shareRuleId` — 룰 상세 (agents+agentGroups+branches 매트릭스 행)
- `POST /admin/settings/share-rules` — 등록
- `POST /admin/settings/share-rules/:shareRuleId` — 수정
- `DELETE /admin/settings/share-rules/:shareRuleId` — 삭제 (FK CASCADE)
- `PUT /admin/settings/share-rules/:shareRuleId/agents` — 상담원/그룹 매트릭스 통째로 교체 (priority 포함)
- `PUT /admin/settings/share-rules/:shareRuleId/branches` — 지사 매트릭스 통째로 교체 (mainPhone/transferPhone 포함)

### 기존 모듈 변경
- `app.module.ts` — `ShareRulesModule` 등록 (HealthModule 직전).
- `common/menu-permission.service.ts` — `MENU_KEYS` 와 `MUTABLE_MENU_KEYS` 에 `settings/share-rules` 추가.
- `admin/admin.service.ts`:
  - `createBranch` / `updateBranch` 에 `defaultShareRuleId` 입출력 + `assertShareRuleBelongsToTenant` 가드.
  - `getBranchMappings` (`branch` 응답) 에 `defaultShareRuleId` 포함.
- `admin/dto/create-branch.dto.ts` — `defaultShareRuleId?` 필드 추가.
- `customers/dto/create-customer.dto.ts` — `shareRuleId?` 필드 추가.
- `customers/customers.service.ts` — create/update 시 `shareRuleId` 패스스루.

## 프론트

### 신규
- `apps/admin/src/features/share-rules/ShareRulesPage.tsx` — 목록 / CRUD 모달 / 매트릭스 Drawer 트리거.
- `apps/admin/src/features/share-rules/ShareRuleEditDrawer.tsx` — 두 탭 (`상담원·그룹 우선순위`, `지사 적용`). 상담원/그룹 priority 편집, 지사별 mainPhone/transferPhone 편집. PUT 단위 저장.

### 수정
- `apps/admin/src/app/router.tsx` — `/settings/share-rules` 라우트.
- `apps/admin/src/shared/permissions/menuConfig.tsx` — "운영 설정" 그룹 아래 "공유규칙 (호 분배)" 메뉴.
- `apps/admin/src/features/customers/CustomerFormFields.tsx` — `shareRuleId` Select (오버라이드용, 비우면 지사 기본 사용).
- `apps/admin/src/features/customers/types/customer.ts` — `CustomerRow.shareRuleId`, `CustomerFormInput.shareRuleId`.
- `apps/admin/src/features/branch-settings/BranchEditModal.tsx` — `defaultShareRuleId` Select (기본 정보 섹션, 활성여부 위). open 시 share-rules fetch.

## 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` (server) | ✅ exit=0 (출력 없음) |
| `npx tsc -b` (admin) | ✅ exit=0 (출력 없음) |
| 마이그레이션 SQL 작성 | ✅ `20260507_share_rules/migration.sql` |
| Prisma generate | ✅ 신규 모델 클라이언트 생성 완료 |
| dev DB 적용 | ⏳ 사용자 측 — `npx prisma migrate deploy` 필요 |
| 실 데이터 검증 | ⏳ 사용자 측 — 룰 등록 → 매트릭스 편집 → 고객/지사 폼 Select 동작 확인 |

## 운영 인수인계

- **마이그레이션 필요**: `cd apps/server && npx prisma migrate deploy && npx prisma generate`
- 새 메뉴 키 `settings/share-rules` 가 추가되었으므로 기본 권한이 supervisor/admin 에게 자동 부여됨 (`DEFAULT_ROLE_ACCESS` 가 `MENU_KEYS` 전체 허용). 별도 권한 시드 불필요.
- **호 분배 실제 반영은 별도 PR**: 이번 PR 은 데이터모델·UI·저장까지. PBX 큐 멤버 penalty/순서로 우선순위를 표현하려면 `apps/server/src/modules/asterisk-config/renderers/` 의 큐 관련 renderer 와 `queues` 모듈의 멤버 동기화 지점이 함께 변경되어야 함.
- 사용 흐름: 운영 설정 → 공유규칙 (호 분배) 메뉴 → 룰 등록 → "매트릭스" 버튼으로 Drawer 열기 → 상담원·그룹 priority + 지사·전화번호 저장. 고객/지사 폼에서 룰 Select.

## 변경 파일 목록

### 신규
- `apps/server/prisma/migrations/20260507_share_rules/migration.sql`
- `apps/server/src/modules/share-rules/share-rules.controller.ts`
- `apps/server/src/modules/share-rules/share-rules.service.ts`
- `apps/server/src/modules/share-rules/share-rules.module.ts`
- `apps/server/src/modules/share-rules/dto/create-share-rule.dto.ts`
- `apps/server/src/modules/share-rules/dto/update-share-rule.dto.ts`
- `apps/server/src/modules/share-rules/dto/put-share-rule-agents.dto.ts`
- `apps/server/src/modules/share-rules/dto/put-share-rule-branches.dto.ts`
- `apps/admin/src/features/share-rules/ShareRulesPage.tsx`
- `apps/admin/src/features/share-rules/ShareRuleEditDrawer.tsx`
- `docs/work-log/20260507-pr3-1-share-rules.md`

### 수정
- `apps/server/prisma/schema.prisma` (4 신규 모델 + customers/branches 컬럼/관계)
- `apps/server/src/app.module.ts` (ShareRulesModule 등록)
- `apps/server/src/common/menu-permission.service.ts` (MENU_KEYS / MUTABLE_MENU_KEYS)
- `apps/server/src/modules/admin/admin.service.ts` (branch defaultShareRuleId 처리)
- `apps/server/src/modules/admin/dto/create-branch.dto.ts`
- `apps/server/src/modules/customers/customers.service.ts` (shareRuleId 패스스루)
- `apps/server/src/modules/customers/dto/create-customer.dto.ts`
- `apps/admin/src/app/router.tsx`
- `apps/admin/src/shared/permissions/menuConfig.tsx`
- `apps/admin/src/features/customers/CustomerFormFields.tsx`
- `apps/admin/src/features/customers/types/customer.ts`
- `apps/admin/src/features/branch-settings/BranchEditModal.tsx`
