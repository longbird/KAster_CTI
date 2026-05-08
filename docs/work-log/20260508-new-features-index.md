# 신규 기능 정리 (2026-05-07 ~ 08)

> BlueSky 격차 보완 1차 마무리. plan: `~/.claude/plans/8-temporal-gray.md`.
> 7개 기능 / 6개 마이그레이션 / 신규 메뉴 4개. PR1-1 부터 PR3-2 까지의 산출물 인덱스.

## 한눈에 보기

| # | 기능 | 새 메뉴 / 위치 | 신규 테이블 | 마이그레이션 | 상세 work-log |
|---|---|---|---|---|---|
| PR1-1 | 상담원 그룹 | `/settings/agent-groups` | `agentGroups` (+ `agents.agentGroupId` 컬럼) | `20260507_agent_groups` | [pr1-1](20260507-pr1-1-agent-groups.md) |
| PR1-2 | 지사 CID 발신권한 매트릭스 | 지사 행 → "발신권한" 버튼 (Drawer) | `agentBranchCallerIds` | `20260507_agent_branch_caller_id_auth` | [pr1-2](20260507-pr1-2-agent-branch-cid-auth.md) |
| PR1-3A | 아웃바운드 발신번호 룰 (CRUD) | `/settings/outbound-rules` | `outboundCallerIdRules` | `20260507_outbound_caller_id_rules` | [pr1-3a](20260507-pr1-3a-outbound-rules.md) |
| PR1-3B | 위 룰의 PBX dialplan 반영 | (재배포 시 자동) | — | — | [pr1-3b](20260507-pr1-3b-outbound-rules-pbx.md) |
| PR2-1 | 지사 VIP 멘트 | 지사 편집 모달 | (`branches.vipPromptId` 컬럼 추가) | `20260507_branch_vip_prompt` | [pr2-1](20260507-pr2-1-branch-vip-prompt.md) |
| PR2-2 | 통화 가능 권한 복사 | 상담원 행 → "권한 복사" | — | — | [pr2-2](20260507-pr2-2-copy-permissions.md) |
| PR2-3 | 녹취 플레이어 (배속/A-B/단축키) | `/reports/recordings` | — | — | [pr2-3](20260507-pr2-3-recording-player.md) |
| PR2-4 | 상담원 업무시간 분포 차트 | `/kpi` | — | — | [pr2-4](20260507-pr2-4-agent-work-time-chart.md) |
| PR3-1 | 공유규칙 매트릭스 | `/settings/share-rules` (+ 고객/지사 폼 Select) | `shareRules`, `shareRuleAgents`, `shareRuleAgentGroups`, `shareRuleBranches` (+ `customers.shareRuleId`, `branches.defaultShareRuleId`) | `20260507_share_rules` | [pr3-1](20260507-pr3-1-share-rules.md) |
| PR3-2 | 외부 자동화 (VIX/Webhook) | `/integrations` 상단 카드 | `integrationAutomations` | `20260507_integration_automations` | [pr3-2](20260507-pr3-2-integration-automations.md) |

## 운영 적용 순서 (재배포 시)

1. **마이그레이션 + Prisma 클라이언트 재생성** (한 줄 묶음 권장 — 이전에 generate 누락으로 빌드 실패한 사례 있음):
   ```bash
   cd apps/server && npx prisma migrate deploy && npx prisma generate
   ```
   디렉터리 6개가 새로 적용됨:
   - `20260507_agent_groups`
   - `20260507_agent_branch_caller_id_auth`
   - `20260507_outbound_caller_id_rules`
   - `20260507_branch_vip_prompt`
   - `20260507_share_rules`
   - `20260507_integration_automations`

2. **빌드 + 재배포**:
   ```bash
   cd apps/server && npm run build
   cd apps/admin && npm run build
   docker compose -f docker-compose.dev.yml up -d --build
   ```

3. **권한 시드 (자동)**: 신규 메뉴 키 4개 (`settings/agent-groups`, `settings/outbound-rules`, `settings/share-rules`, `integrations`) 는 `MENU_KEYS` 와 `MUTABLE_MENU_KEYS` 에 등록되어 있어 supervisor/admin 기본 권한이 자동 부여됨. 별도 시드 불필요.

## 신규 endpoint 모음

### 운영 설정
- `GET/POST /admin/settings/agent-groups`, `PATCH/DELETE /admin/settings/agent-groups/:id`
- `GET/PUT /admin/settings/branches/:branchId/agent-caller-ids` (CID 매트릭스)
- `GET /admin/agents/:agentId/caller-id-permissions` / `GET /me/caller-id-permissions`
- `GET/POST /admin/settings/outbound-rules`, `PATCH/DELETE /admin/settings/outbound-rules/:id`, `POST /admin/settings/outbound-rules/test`
- `GET/POST /admin/settings/share-rules`, `GET/POST/DELETE /admin/settings/share-rules/:id`, `PUT /admin/settings/share-rules/:id/agents`, `PUT /admin/settings/share-rules/:id/branches`
- `GET/POST /admin/settings/integrations`, `POST /admin/settings/integrations/:id`, `POST /admin/settings/integrations/:id/toggle`, `POST /admin/settings/integrations/:id/test`, `DELETE /admin/settings/integrations/:id`

### 상담원
- `POST /admin/agents/:targetAgentId/copy-permissions`

### 리포트
- `GET /admin/reports/agent-work-time?from&to&granularity&groupBy&agentId&agentGroupId`

### 기존 endpoint 변경
- 지사 create/update DTO 에 `vipPromptId`, `defaultShareRuleId` 필드 추가
- 고객 create/update DTO 에 `shareRuleId` 필드 추가
- 상담원 create/update 가 `agentGroupId` 의 테넌트 소유권 검증

## 사용자 흐름 체크리스트 (스모크 테스트)

supervisor 계정으로 로그인 후 메뉴별 진입·CRUD·매트릭스 저장만 빠르게 확인:

- [ ] **운영 설정 > 상담원 그룹** — 그룹 등록/수정/삭제
- [ ] **운영 설정 > 지사 관리** — 지사 행에서 "발신권한" Drawer → CID 매트릭스 저장
- [ ] **운영 설정 > 지사 관리** — 지사 편집에서 VIP 멘트 / 기본 공유규칙 Select 노출
- [ ] **운영 설정 > 아웃바운드 발신번호** — 룰 등록 + "룰 테스트" 버튼 동작
- [ ] **운영 설정 > 공유규칙 (호 분배)** — 룰 등록 → "매트릭스" Drawer → 상담원/그룹/지사 저장
- [ ] **운영 설정 > 상담원 설정** — 상담원 행에서 "권한 복사" 모달
- [ ] **고객 관리** — 고객 폼에 공유규칙 Select 노출
- [ ] **업무 현황 조회 (KPI)** — "상담원 업무시간 분포" stacked column 차트 렌더
- [ ] **녹취 목록** — 행 재생 → 배속(0.5/1/1.25/1.5/2x) / A-B / 단축키 (Space, ←/→, ↑/↓, [ / ])
- [ ] **연동** — 자동화 등록 (VIX/Webhook 모두) → "테스트" 버튼 dry-run 응답

## 알려진 한계 / Follow-up

| 항목 | 현재 상태 | 후속 PR 필요 |
|---|---|---|
| 아웃바운드 룰 PBX 반영 | 전역 룰만 dialplan `[outbound-cid-rules]` 에 주입. **branchId 가 있는 룰은 PBX 미반영** (오작동 방지). REGEX 룰은 NoOp 주석. | 지사별 dialplan 분리 |
| 공유규칙 호 분배 실 적용 | 데이터 모델 + UI 저장까지. 실제 큐 멤버 penalty/순서 동기화 안 됨 | PBX 큐 멤버 동기화 follow-up |
| Integrations 자동 트리거 | 등록 + 수동 dry-run 까지. 통화/이벤트 발생 시 자동 호출 안 됨 | SessionEngine / EventBus 후크 |
| 권한 fail-closed | `usePermissionStore` catch 시 `/dashboard` 만 허용. 페이지 내부 `?? true` fallback 은 mock 모드용으로 보존 (운영 모드에선 진입 자체가 막혀 무력화) | — (의도된 설계) |

## 최근 회귀 확인 결과

| 게이트 | 결과 |
|---|---|
| `apps/server` `npx tsc --noEmit` | ✅ exit 0 |
| `apps/server` `npm test -- --runInBand` | ✅ 32 suites / 203 tests |
| `apps/admin` `npx tsc -b` | ✅ exit 0 |
| `apps/admin` `npm test -- --run` | ✅ 18 files / 54 tests |

## 변경 영향 요약

- 새 React 라이브러리 1종: `@ant-design/charts` (PR2-4)
- 새 dev 의존성 1종: `@types/node` (admin Vitest 게이트 복구)
- 메뉴 키 신규 4개 / 마이그레이션 신규 6개 / 백엔드 모듈 신규 4개 (`agent-groups`, `outbound-rules`, `share-rules`, `integrations`)
- BlueSky 격차 9개 중 7개 기능 + 사용자가 명시 제외한 SMS 4종 / 클레임 / 시스템 운영액션 / 수지·정산 / AI 상담원 시간대 설정은 범위 외
