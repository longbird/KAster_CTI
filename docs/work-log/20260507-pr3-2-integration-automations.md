# PR3-2 — Integrations VIX 자동화

> BlueSky `DlgVixActionPhone` / `DlgVixActionSms` 등가물. plan: `~/.claude/plans/8-temporal-gray.md` PR 3-2.

## 변경 요약

`integrationAutomations` 단일 테이블에 type 별 config Json 으로 다양한 외부 자동화(VIX 전화/SMS, Webhook, Slack)를 등록·관리할 수 있는 CRUD + 수동 테스트(dry-run) 기능. 기존 `IntegrationsPage` 의 정적 카드 위에 자동화 테이블 카드를 신설.

## DB 변경

마이그레이션: `apps/server/prisma/migrations/20260507_integration_automations/migration.sql`

신규 테이블 1개:
- `integrationAutomations`
  - `type VARCHAR(32)` — `VIX_PHONE | VIX_SMS | WEBHOOK | SLACK_WEBHOOK` (DTO IsIn 으로 강제, DB 는 자유 문자열로 두어 신규 type 추가 시 마이그레이션 없이 코드만 갱신).
  - `config JSONB` — type 별 설정 (host/port/authToken/route 또는 url/secret/headers).
  - `enabled Boolean`, `lastTriggeredAt TimestampTZ?`, 표준 audit 컬럼.
  - 인덱스: `(tenantId, type, enabled)`, `(tenantId, name)`.

## 서버

### 신규 모듈
`apps/server/src/modules/integrations/`
- `integrations.controller.ts` — `JwtAuthGuard + RolesGuard + @Roles('supervisor','admin')`. 기존 메뉴 키 `integrations` 권한을 그대로 사용 (별도 키 추가 없음).
- `integrations.service.ts` — CRUD + toggle(`enabled` flip) + test(dry-run, `lastTriggeredAt` 만 갱신).
- DTO 3종: `create-integration-automation.dto.ts`, `update-integration-automation.dto.ts`, `test-integration-automation.dto.ts`.

### Endpoint
- `GET /admin/settings/integrations` — 자동화 목록
- `POST /admin/settings/integrations` — 등록
- `POST /admin/settings/integrations/:id` — 수정
- `POST /admin/settings/integrations/:id/toggle` — 사용 여부 toggle
- `POST /admin/settings/integrations/:id/test` — dry-run 테스트
- `DELETE /admin/settings/integrations/:id` — 삭제

### 기존 모듈 변경
- `app.module.ts` — `IntegrationsModule` 등록 (HealthModule 직전).
- 메뉴 키 `integrations` 는 이미 등록되어 있어 추가 작업 없음 (`MENU_KEYS` / `MUTABLE_MENU_KEYS` 모두 보유).

## 프론트

### 신규
- `apps/admin/src/features/integrations/IntegrationFormModal.tsx`
  - type 별 동적 폼: VIX 류는 host/port/authToken/route, Webhook 류는 url/secret/headers(JSON 또는 raw 문자열).
  - `buildPayload` 가 폼값을 `{ type, name, description?, config, enabled }` 형태로 정규화.

### 수정
- `apps/admin/src/features/integrations/IntegrationsPage.tsx`
  - 페이지 상단에 "외부 자동화 (VIX / Webhook)" 카드 추가 (테이블 + 등록 버튼).
  - 행별 액션: 테스트(dry-run) / 수정 / 삭제 / 사용 여부 토글.
  - 권한 가드: `usePermissionStore` 의 `permissionsByMenu['integrations']` 로 canCreate/Update/Delete/Operate 제어.
  - 기존 정적 카드(Slack/Webhook/CRM/BI/AMI/Redis/PG) 는 유지.

## 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` (server) | ✅ exit=0 |
| `npx tsc -b` (admin) | ✅ exit=0 |
| 마이그레이션 SQL 작성 | ✅ `20260507_integration_automations/migration.sql` |
| Prisma generate | ✅ 신규 모델 클라이언트 생성 |
| dev DB 적용 | ⏳ `npx prisma migrate deploy` 필요 |
| 실 데이터 검증 | ⏳ 사용자 측 — 등록 → 테스트 dry-run → toggle 동작 확인 |

## 운영 인수인계

- 마이그레이션 필요: `cd apps/server && npx prisma migrate deploy && npx prisma generate`
- 메뉴 권한: 기존 `integrations` 메뉴 권한 재사용. 별도 시드 불필요.
- 사용 흐름: 연동 페이지 → "자동화 등록" → type 선택 → 자동으로 type 별 동적 필드 노출 → 저장 → "테스트" 로 dry-run.
- **자동 트리거 follow-up**: 통화/이벤트 발생 시 자동 호출은 별도 PR 에서. SessionEngine 또는 EventBus 후크 지점에서 `where: { tenantId, type, enabled: true }` 로 자동화 lookup → config 기반 외부 호출 + `lastTriggeredAt` 갱신.
- type 추가는 **DB 마이그레이션 불필요**: `INTEGRATION_AUTOMATION_TYPES` (DTO) + `IntegrationFormModal` 의 동적 필드만 갱신.

## 변경 파일 목록

### 신규
- `apps/server/prisma/migrations/20260507_integration_automations/migration.sql`
- `apps/server/src/modules/integrations/integrations.controller.ts`
- `apps/server/src/modules/integrations/integrations.service.ts`
- `apps/server/src/modules/integrations/integrations.module.ts`
- `apps/server/src/modules/integrations/dto/create-integration-automation.dto.ts`
- `apps/server/src/modules/integrations/dto/update-integration-automation.dto.ts`
- `apps/server/src/modules/integrations/dto/test-integration-automation.dto.ts`
- `apps/admin/src/features/integrations/IntegrationFormModal.tsx`
- `docs/work-log/20260507-pr3-2-integration-automations.md`

### 수정
- `apps/server/prisma/schema.prisma` (integrationAutomations 모델 추가 + tenants relation)
- `apps/server/src/app.module.ts` (IntegrationsModule 등록)
- `apps/admin/src/features/integrations/IntegrationsPage.tsx` (자동화 카드/테이블/모달)
