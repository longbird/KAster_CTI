# PR1-2 — 상담원-지사 CID 발신권한 매트릭스

> BlueSky `JisaPossibleAuth` 등가물. plan: `~/.claude/plans/8-temporal-gray.md` PR 1-2.

## 변경 요약

각 지사가 가진 발신번호(CID) 마다, 상담원이 인바운드 / 아웃바운드 / 전환을 할 수 있는지를 매트릭스로 관리한다. 다중 지사 운영에서 "이 상담원은 A지사 070-xxx 로만 발신, B지사 080-xxx 로는 인바운드 수신 가능" 같은 정책을 표현한다.

## DB 변경

- 신규 테이블 `agentBranchCallerIds` (BlueSky `JisaPossibleAuth` 등가):
  - PK `agentBranchCallerIdId UUID`
  - `tenantId UUID`, `branchId UUID FK`, `agentId UUID FK`
  - `callerIdNumber VARCHAR(32)`, `displayName VARCHAR(64)?`
  - `allowedInbound BOOL`, `allowedOutbound BOOL`, `allowedTransfer BOOL`
  - `sortOrder INT`, `createdAt`, `updatedAt`
  - `UNIQUE(tenantId, branchId, agentId, callerIdNumber)`
  - `INDEX(tenantId, branchId, agentId)`, `INDEX(tenantId, agentId)`
  - 모든 FK `ON DELETE CASCADE` (지사/상담원 삭제 시 권한 행도 같이 정리)
- 마이그레이션: `apps/server/prisma/migrations/20260507_agent_branch_caller_id_auth/migration.sql`.
- `branchAgents` 매핑은 그대로 두고, 권한 매트릭스만 별도 테이블로 분리 (BlueSky 모델과 동일).

## 서버

### Endpoint

| 경로 | 권한 | 설명 |
|---|---|---|
| `GET /admin/settings/branches/:branchId/agent-caller-ids` | supervisor/admin (`settings/branches:view`) | 지사 단위 매트릭스 — `{ branch, agents, entries }` |
| `POST /admin/settings/branches/:branchId/agent-caller-ids` | supervisor/admin (`settings/branches:update`) | bulk upsert: 트랜잭션으로 기존 행 deleteMany → createMany |
| `GET /admin/agents/:agentId/caller-id-permissions` | supervisor/admin (`settings/agents:view`) | 상담원 시점 합본 (전 지사) |
| `GET /me/caller-id-permissions` | JwtAuthGuard (본인) | apps/web · apps/desktop 발신 UI 가 사용. `request.user.sub` 의 권한 목록만 반환 |

본인 조회는 admin 컨트롤러가 아닌 `auth.controller` 의 `/me/*` 영역에 두어 `agents.controller` 의 `user.sub !== agentId && !SUPERVISORY_ROLES.has(user.role)` 류 인라인 분기를 피했다.

### 입력 검증

- `UpdateAgentBranchCallerIdsDto`:
  - `entries[]` 최대 2000건.
  - `callerIdNumber`: `^[0-9+\-]{1,32}$` (DTO + 매트릭스 저장 직전 양쪽).
  - 미지의 `agentId` 가 포함되면 `BadRequestException`.

### 코드 위치
- DTO: `apps/server/src/modules/admin/dto/update-agent-branch-caller-ids.dto.ts`
- Service: `AdminService.{listBranchAgentCallerIds, updateBranchAgentCallerIds, listAgentCallerIdPermissions}` (`admin.service.ts`). 본인 조회는 `AuthService.listMyCallerIdPermissions`.
- Controller: `apps/server/src/modules/admin/admin.controller.ts` (관리자 3개), `apps/server/src/modules/auth/auth.controller.ts` (본인 1개).

## 프론트

### 신규 컴포넌트
- `apps/admin/src/features/branch-settings/BranchAgentCidAuthDrawer.tsx`
  - 지사 단위 매트릭스 편집 Drawer (1200px). 행=상담원, 열=callerIdNumber.
  - 각 셀에 인바운드/아웃바운드/전환 3 boolean 체크박스 (BlueSky `DlgJisaCidConfig` 패턴).
  - 발신번호 추가 모달 (callerIdNumber + displayName, 화이트리스트 검증 `^[0-9+\-]{1,32}$`).
  - 발신번호 행 삭제 (열 단위 헤더 액션).
  - 저장: 모든 권한이 false 인 행은 자동 제거.

### 통합
- `BranchSettingsPage` 의 관리 컬럼에 "발신권한" 버튼 추가 (`PhoneOutlined`). 클릭 시 Drawer 열림.

## 검증 결과

| 항목 | 결과 |
|---|---|
| `npx prisma generate` | ✅ Prisma Client 재생성 |
| `npx tsc --noEmit` (server) | ✅ exit=0 |
| `npx tsc -b` (admin) | ✅ exit=0 |
| `jest menu-permission|admin\.` | ✅ menu-permission 4 PASS, optout spec 은 main부터 깨져 있던 항목(생성자 인자 mismatch — 변경 무관, stash 검증 완료) |
| dev DB 마이그레이션 적용 | ⏳ 사용자 측 수동 검증 |

## 운영 인수인계

1. `cd apps/server && npx prisma migrate deploy && npx prisma generate`
2. 서버 재기동.
3. admin 빌드 재배포.
4. 운영 설정 > 지사 관리 → 행 [발신권한] 버튼 → Drawer 에서 발신번호 추가 후 셀별 권한 체크 → 저장.
5. apps/web · apps/desktop 의 발신 UI 가 `/me/caller-id-permissions` 를 호출해 발신 가능한 번호를 표시 — UI 통합은 별도 PR (현재는 endpoint 만 존재).

## 후속 의존성

- PR1-3B (PBX 렌더 반영): dialplan 의 발신 가능 번호 결정에 이 매트릭스를 사용.
- PR2-2 (권한 복사): `branchCidAuth` scope 가 이 테이블을 source → target 으로 복제.
- apps/web · apps/desktop 발신 UI 통합 (별도 PR).

## 변경 파일 목록

### 신규
- `apps/server/prisma/migrations/20260507_agent_branch_caller_id_auth/migration.sql`
- `apps/server/src/modules/admin/dto/update-agent-branch-caller-ids.dto.ts`
- `apps/admin/src/features/branch-settings/BranchAgentCidAuthDrawer.tsx`

### 수정
- `apps/server/prisma/schema.prisma` (agentBranchCallerIds 모델 + tenants/branches/agents 의 relation)
- `apps/server/src/modules/admin/admin.service.ts` (3개 메서드)
- `apps/server/src/modules/admin/admin.controller.ts` (3개 endpoint)
- `apps/server/src/modules/auth/auth.service.ts` (`listMyCallerIdPermissions`)
- `apps/server/src/modules/auth/auth.controller.ts` (`GET /me/caller-id-permissions`)
- `apps/admin/src/features/branch-settings/BranchSettingsPage.tsx` (발신권한 버튼 + Drawer 통합)
