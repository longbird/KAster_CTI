# PR1-1 — 상담원 그룹 (Agent Group)

> BlueSky `StaffGroup` 등가물. plan: `~/.claude/plans/8-temporal-gray.md` PR 1-1.

## 변경 요약

상담원을 조직/팀 단위로 묶는 "상담원 그룹" 도메인을 추가했다. 호분배 룰·통계·UX에서 그룹 단위 분류가 필요해진다는 PR3-1(공유규칙) / PR2-4(업무시간 분포 차트)의 사전 의존성이기도 하다.

## DB 변경

- 신규 테이블 `agentGroups`
  - `agentGroupId UUID PK`, `tenantId UUID`, `groupCode VARCHAR(32)`, `groupName VARCHAR(128)`, `description TEXT?`, `isActive BOOL`, `createdAt`, `updatedAt`, `updatedById UUID?`
  - `UNIQUE(tenantId, groupCode)`, `INDEX(tenantId, isActive)`, FK → `tenants(tenantId)`.
- `agents.agentGroupId UUID?` 추가. FK → `agentGroups(agentGroupId)` `ON DELETE SET NULL` (그룹 삭제 시 소속 상담원의 그룹 지정 해제).
- 마이그레이션: `apps/server/prisma/migrations/20260507_agent_groups/migration.sql`.

## 서버

### 권한 키 등록
`apps/server/src/common/menu-permission.service.ts:21,60` — `MENU_KEYS`/`MUTABLE_MENU_KEYS` 에 `'settings/agent-groups'` 추가. `defaultPermissionFlags` 가 자동으로 supervisor/admin 에 CRUD 권한 부여.

### Endpoint (모두 `@Roles('supervisor','admin')`)
- `GET    /admin/settings/agent-groups`
- `POST   /admin/settings/agent-groups`
- `POST   /admin/settings/agent-groups/:agentGroupId` (update — 기존 announcements 패턴 동일)
- `DELETE /admin/settings/agent-groups/:agentGroupId`

### 코드 위치
- DTO: `apps/server/src/modules/admin/dto/{create,update}-agent-group.dto.ts`
- Service: `AdminService.{listAgentGroups, createAgentGroup, updateAgentGroup, deleteAgentGroup}` (`admin.service.ts` 끝부분).
  - `listAgentGroups` 응답에 `memberCount`(소속 활성 상담원 수) 포함.
  - `createAgentGroup` 은 `tenantId+groupCode` 유니크 충돌 시 `BadRequestException`.
  - `updateAgentGroup` 도 `groupCode` 변경 시 동일 유니크 가드.
- Controller: `apps/server/src/modules/admin/admin.controller.ts` 에 4개 메서드.

### 상담원 DTO/Service 통합
- `CreateAgentDto`/`UpdateAgentDto` 에 `agentGroupId?: string | null` 추가 (`@IsUUID()`).
- `AgentsService.listForTenant` select 에 `agentGroupId` + `agentGroup{groupCode,groupName}` join.
- `AgentsService.create`/`update` 에 `agentGroupId` 반영.

## 프론트

### 신규 페이지
- `apps/admin/src/features/agent-groups/AgentGroupsPage.tsx` — 그룹 목록 Antd Table + 등록/수정 Modal + 삭제 Popconfirm. 권한 store(`usePermissionStore`)로 canCreate/Update/Delete 가드.

### 라우트/메뉴
- `apps/admin/src/app/router.tsx` 에 `/settings/agent-groups` 라우트 추가.
- `apps/admin/src/shared/permissions/menuConfig.tsx` 에 "운영 설정 > 상담원 그룹" 메뉴 노드 추가.

### 상담원 모달 통합
- `AgentCreateModal`, `AgentEditModal` 양쪽에 그룹 Select 추가 (`/admin/settings/agent-groups` GET 으로 옵션 로드).
- 기존 라벨 "그룹(대표 큐)" → "대표 큐"로 분리 정정 (사용자 혼동 회피). `defaultQueueId` 필드 자체는 유지.
- `AgentRow` 인터페이스에 `agentGroupId?: string | null` 추가.

## 검증 결과

| 항목 | 결과 |
|---|---|
| `npx prisma generate` | ✅ Prisma Client 재생성 |
| `npx tsc --noEmit` (server) | ✅ exit=0 |
| `npx tsc -b` (admin) | ✅ exit=0 |
| `jest menu-permission.service.spec` | ✅ 4 pass (신규 테스트 1개 포함) |
| 전체 server jest | ✅ menu-permission/agents/announcements 등 PASS. 기존 main에서 이미 깨져 있던 3 suites(`agents.service.spec.ts`, `auth-desktop-session`, `admin.service.optout`)는 변경 무관 — stash로 확인 |
| dev DB 마이그레이션 적용 | ⏳ 사용자 측 수동 검증(`npx prisma migrate deploy && npx prisma generate`) |

## 운영 인수인계 (배포 시)

1. `cd apps/server && npx prisma migrate deploy && npx prisma generate`
2. 서버 재기동.
3. admin 빌드 재배포 (`apps/admin && npm run build`).
4. 권한 매트릭스 — supervisor/admin 은 자동으로 `settings/agent-groups` 에 CRUD 권한이 생긴다. 기존 agent 역할은 접근 불가.
5. UI 흐름: 운영 설정 > 상담원 그룹 메뉴 → 그룹 등록 → 상담원 설정에서 각 상담원의 그룹 지정.

## 후속 의존성

- PR2-4 (업무시간 분포 차트): `agentGroupId` 필터/그룹화 사용.
- PR3-1 (공유규칙 매트릭스): `shareRuleAgentGroups` 가 `agentGroupId` FK 참조.

## 변경 파일 목록

### 신규
- `apps/server/prisma/migrations/20260507_agent_groups/migration.sql`
- `apps/server/src/modules/admin/dto/create-agent-group.dto.ts`
- `apps/server/src/modules/admin/dto/update-agent-group.dto.ts`
- `apps/admin/src/features/agent-groups/AgentGroupsPage.tsx`

### 수정
- `apps/server/prisma/schema.prisma`
- `apps/server/src/common/menu-permission.service.ts`
- `apps/server/src/common/menu-permission.service.spec.ts`
- `apps/server/src/modules/admin/admin.service.ts`
- `apps/server/src/modules/admin/admin.controller.ts`
- `apps/server/src/modules/agents/agents.service.ts`
- `apps/server/src/modules/agents/dto/create-agent.dto.ts`
- `apps/server/src/modules/agents/dto/update-agent.dto.ts`
- `apps/admin/src/app/router.tsx`
- `apps/admin/src/shared/permissions/menuConfig.tsx`
- `apps/admin/src/features/agent-settings/AgentCreateModal.tsx`
- `apps/admin/src/features/agent-settings/AgentEditModal.tsx`
