# PR2-2 — 통화 가능 권한 복사

> BlueSky `DlgCallPossibleAuthCopy` 등가물. plan: `~/.claude/plans/8-temporal-gray.md` PR 2-2.

## 변경 요약

소스 상담원의 권한을 타겟 상담원으로 일괄 복제하는 모달 + 엔드포인트. 새 상담원을 채용해 기존 베테랑과 같은 환경으로 신속히 세팅하는 운영 시나리오를 지원.

## DB 변경
없음. 기존 테이블만 사용.

## 서버

### Endpoint
- `POST /agents/:targetAgentId/copy-permissions { sourceAgentId, scopes: string[] }`
- 가드: `JwtAuthGuard + RolesGuard + @Roles('supervisor','admin')` + `menuPermission.assert('settings/agents','update')`.

### scopes
- **핵심 (상담원별 권한 한정, UI 기본 체크)**:
  - `queueMembership` — `queueAgentMembers` (penalty/memberOrder 포함)
  - `branchCidAuth` — `agentBranchCallerIds` (인/아웃/전환 매트릭스)
  - `menuPermissions` — `agentMenuPermissions` (역할 기본 위 덮어쓰기)
  - `agentSettingsProfile` — `agents.settingsProfile` JSON
- **옵션 (별도 토글, 자리표시)**:
  - `outboundCallerIdOverride` — 아웃바운드 룰은 본질적으로 전역/지사 단위라 권한 복사에 무차별 포함 시 위험. 향후 상담원 단위 예외 도입 시 활성화. 현재는 호출되어도 noop (`summary: 0`).

### 트랜잭션 동작
- `prisma.$transaction` 으로 묶어 중간 실패 시 모두 롤백.
- 각 scope: `deleteMany(target) → createMany(source.copy)` 패턴. settingsProfile 은 `update`.
- `branchCidAuth` 또는 `agentSettingsProfile` 또는 `queueMembership` 가 적용되면 `asteriskReload.scheduleReload(tenantId)` 트리거 — dialplan 재생성.

### 검증
- source !== target 동일 ID 차단 (`ConflictException`).
- source/target 둘 다 tenant 격리 검증 (`NotFoundException`).
- DTO `@IsEnum(PERMISSION_COPY_SCOPES, { each: true })` 로 알 수 없는 scope 차단.

### 코드 위치
- DTO: `apps/server/src/modules/agents/dto/copy-agent-permissions.dto.ts`
- Service: `AgentsService.copyPermissions` (agents.service.ts 끝부분)
- Controller: `AgentsController.copyPermissions` (`POST /agents/:targetAgentId/copy-permissions`)

## 프론트

- 신규 `apps/admin/src/features/agent-settings/AgentPermissionCopyModal.tsx`:
  - 상단 Alert: "이 작업은 되돌릴 수 없습니다"
  - 소스 상담원 Select (target 본인 제외, 활성 상담원만)
  - 핵심 4개 scope Checkbox 그룹 (기본 체크)
  - 옵션 1개 scope (`outboundCallerIdOverride`, 시각 구분 type=warning)
  - 적용 버튼 `danger=true`로 시각 강조
- `AgentSettingsPage` 행 액션에 "권한복사" 버튼 추가 (`CopyOutlined`). `canUpdate` 권한 가드.

## 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` (server) | ✅ exit=0 |
| `npx tsc -b` (admin) | ✅ exit=0 |
| dev DB 마이그레이션 적용 | ⏳ 사용자 측 수동 검증 (DB 변경 없으므로 마이그레이션 불필요) |

## 운영 인수인계

- 마이그레이션 불필요. server/admin 빌드 + 재배포만.
- 사용 흐름: 운영 설정 > 상담원 설정 → 행의 [권한복사] → 모달에서 소스 + scope 선택 → 적용.
- 적용 후 dialplan 재생성이 자동 트리거되므로 추가 reload 작업 불필요.

## 변경 파일 목록

### 신규
- `apps/server/src/modules/agents/dto/copy-agent-permissions.dto.ts`
- `apps/admin/src/features/agent-settings/AgentPermissionCopyModal.tsx`

### 수정
- `apps/server/src/modules/agents/agents.service.ts` (copyPermissions 메서드)
- `apps/server/src/modules/agents/agents.controller.ts` (POST endpoint)
- `apps/admin/src/features/agent-settings/AgentSettingsPage.tsx` (버튼 + 모달 통합)
