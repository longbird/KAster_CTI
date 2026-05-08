# PR2-1 — VIP 멘트 연결 (지사 단위)

> BlueSky `Jisa.m_nMentVipCD` 등가물. plan: `~/.claude/plans/8-temporal-gray.md` PR 2-1.

## 변경 요약

지사(branch) 단위로 VIP 고객 통화 시 사용할 멘트를 지정할 수 있게 한다. 고객의 `customers.grade==='VIP'` 와 `branch.vipPromptId` 가 결합돼 라우팅 시 VIP 전용 멘트를 우선 재생할 수 있다 (실제 dialplan 반영은 follow-up).

## DB 변경

- `branches.vipPromptId UUID?` + FK → `AsteriskPrompt(id)` `ON DELETE SET NULL`. 컬럼+관계로 명시 (BlueSky `m_nMentVipCD` 등가, FK 무결성 확보).
- `branchOperationProfiles` 는 현 스키마에 없음 — `branches.settingsProfile` JSON 패스스루는 멘트 카테고리 운영 옵션용. VIP 멘트는 별도 컬럼으로 분리해 FK 참조.
- 인덱스: `branches_tenantId_vipPromptId_idx`.
- 마이그레이션: `apps/server/prisma/migrations/20260507_branch_vip_prompt/migration.sql`.

## 서버

- `CreateBranchDto.vipPromptId?: string | null` 추가 (`@IsUUID()` 옵션).
- `AdminService.createBranch / updateBranch` 가 `vipPromptId` 패스스루 — 입력 시 `assertPromptBelongsToTenant` 로 tenant 격리 검증 (다른 tenant 의 prompt id 이용 차단).
- `listBranches` 의 include 에 `vipPrompt: { id, promptKey, displayName }` 추가 — UI 가 ID 만이 아니라 사람이 읽는 라벨도 표시 가능.
- `getBranchMappings` 응답의 `branch` 객체에 `vipPromptId` 포함.

## 프론트

- `BranchRow` 에 `vipPromptId?` + `vipPrompt?: {id, promptKey, displayName}` 추가.
- `BranchConfigFormValue.vipPromptId?: string` 추가.
- `MappingResponse.branch.vipPromptId?` 추가.
- `buildInitialValues` 가 `vipPromptId` 를 mapping > branch > undefined 우선순위로 채움.
- 멘트 탭 — 기본 멘트 / 지연 / 멘트완료 대기 사이에 **"VIP 멘트"** Select(`PromptSelectWithPreview`) Form.Item 추가. 미설정 시 기본 멘트로 fallback 안내.
- 제출 payload `branchPayload.vipPromptId = values.vipPromptId || null` 추가 — 빈 값이면 명시적으로 null 로 보내 컬럼 초기화.

## 검증 결과

| 항목 | 결과 |
|---|---|
| `npx prisma generate` | ✅ Prisma Client 재생성 |
| `npx tsc --noEmit` (server) | ✅ exit=0 |
| `npx tsc -b` (admin) | ✅ exit=0 |
| dev DB 마이그레이션 적용 | ⏳ 사용자 측 수동 검증 (`npx prisma migrate deploy && npx prisma generate`) |

## 운영 인수인계

1. `cd apps/server && npx prisma migrate deploy && npx prisma generate`
2. 서버 재기동.
3. admin 재배포.
4. 운영 설정 > 지사 관리 → 지사 설정 모달 → 멘트 탭 → "VIP 멘트" 에서 prompt 선택 → 저장.
5. 실제 dialplan 반영은 follow-up PR — 현 시점에서는 컬럼·UI 만 노출되고, 호 분배 시 VIP 우선 멘트 재생은 동작하지 않음.

## 후속 작업

- VIP 라우팅 dialplan 반영: 인바운드 컨텍스트(`renderInboundDialplan` 또는 smart-ars renderer)에서 `customer.grade==='VIP'` 분기 시 `branch.vipPromptId` 가 있으면 우선 재생. customers 테이블의 grade 와 branch 매칭이 라우팅 단계에 와야 함.
- 운영자 화면에서 fallback 시각화: VIP 멘트가 없는 지사에서 VIP 고객 발생 시 어떤 멘트가 재생됐는지 통계.

## 변경 파일 목록

### 신규
- `apps/server/prisma/migrations/20260507_branch_vip_prompt/migration.sql`

### 수정
- `apps/server/prisma/schema.prisma` (branches.vipPromptId + relations)
- `apps/server/src/modules/admin/dto/create-branch.dto.ts` (vipPromptId 필드)
- `apps/server/src/modules/admin/admin.service.ts` (createBranch/updateBranch/listBranches/getBranchMappings)
- `apps/admin/src/features/branch-settings/BranchEditModal.tsx` (BranchRow/BranchConfigFormValue/MappingResponse + Form.Item + payload)
