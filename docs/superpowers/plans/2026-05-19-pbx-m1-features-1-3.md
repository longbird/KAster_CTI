# PBX M1 기능 1~3 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox syntax for tracking.

> **Completion reconciliation (2026-05-22):** 이 실행계획서는 최신 상위 계획서 `docs/design/pbx-selected-features-development-plan-20260514.md`와 커밋 이력을 기준으로 완료 상태로 정리했다. 운영 DB `prisma migrate deploy`와 운영 PBX 반영 검증은 코드 완료 판정에 포함하지 않고 별도 운영 절차로 분리한다.

**Goal:** PBX 선별 수용 계획서 M1의 P0 기능 1~3(지사별 DID/ARS/착신 정책, 외부 착신 방식 정의, 착신전환 조건 다양화)을 서버 검증·저장·렌더링 계층과 관리자 UI에 통합하고, 각 설정 화면에 공통 도움말 아이콘을 적용한다.

**Architecture:** 기능별로 서버(Prisma 스키마 → DTO → 서비스 검증 → PBX 렌더러)와 관리자 UI(`apps/admin` 기능 디렉터리)를 분리해 작업한다. 순수 변환/분류 로직은 별도 파일로 추출해 단위 테스트로 고정하고, PBX 설정 파일 반영은 렌더러 spec 테스트로 검증한다. 도움말은 정적 JSON + 공통 컴포넌트(`FeatureHelpButton`)로 시작한다.

**Tech Stack:** NestJS 10, Prisma, PostgreSQL 16, Jest(서버 렌더러/서비스 spec), React 18/19, Vite, Ant Design 5, Vitest(관리자 앱).

---

## 기준 문서

- 상위 계획서: `docs/design/pbx-selected-features-development-plan-20260514.md` (마일스톤 M1, 기능 1~3)
- 도움말 컴포넌트 명세: `docs/superpowers/plans/2026-05-19-pbx-feature-help.md` (Chunk 1~3 = Task 1~6)
- 내부 경계 참고:
  - 서버 스키마: `apps/server/prisma/schema.prisma`
  - 관리자 서비스: `apps/server/src/modules/admin/admin.service.ts`
  - 큐 서비스: `apps/server/src/modules/queues/queues.service.ts`
  - PBX 렌더러: `apps/server/src/modules/asterisk-config/renderers/`
  - 착신전환 서비스: `apps/server/src/modules/asterisk-config/asterisk-config.service.ts`

## 범위 / 비범위

**범위:**
- 기능 1: 지사에 연결된 DID의 착신 경로(ARS / 직접 분배룰 / 착신전환) 분류·표시, DID 중복 연결 방지 검증.
- 기능 2: 외부 착신 방식(순차/분배/무조건)을 `queues.distributionMode` 전용 컬럼으로 저장, PBX queue strategy 매핑, 호 분배룰 UI 재구성.
- 기능 3: 착신전환 시간 조건이 자정을 넘는 구간(예: 22:00~06:00)을 지원하도록 서버 검증 완화 + PBX 렌더러 분기 + UI 검증 완화.
- 도움말: `FeatureHelpButton`/`FeatureHelpPanel` 공통 컴포넌트 생성(도움말 명세서 Task 1~6) + 기능 1~3 화면 3곳에 적용.

**비범위 (후속):**
- 무조건 착신(UNCONDITIONAL)의 "대상이 상담원/분배룰/외부번호" 세분 선택 UI — 본 플랜은 distributionMode 값 저장과 strategy 매핑까지만. (상위 계획서 기능 2 UI 항목의 세분 선택은 후속.)
- 도움말 자동 구축 스크립트(`build-pbx-feature-help.ts`) 및 PDF/엑셀 추출 — 도움말 명세서 Chunk 5, 본 플랜 범위 밖.
- 도움말 명세서 Task 7(SystemSettings/Agent/AsteriskConfig 등 6개 화면 일괄 적용) — 본 플랜은 기능 1~3 화면 3곳만 적용.
- ARS 메뉴(IVR) 자체의 CRUD 변경 — 기존 PBX 설정 화면 그대로 사용.

## 가정

- **서버 착신전환 로직은 이미 다중 시간표·트리거 모드를 완비함.** `CreateForwardingRuleDto.schedules`, `normalizeForwardingSchedules`, `parseForwardingSchedules`, 렌더러의 `AFTER_QUEUE_WAIT`/`SMART_NO_READY`/`scheduleJson` 처리가 모두 존재. 따라서 기능 3은 **자정 넘는 구간 지원 + UI 완성**으로 한정한다.
- **DID의 ARS(`ivrMenuId`)와 직접 분배룰(`directQueue`) 동시 활성 금지는 이미 서버에서 검증됨** (`asterisk-config.service.ts` 의 `'ivrMenuId and directQueue are mutually exclusive'`). 기능 1은 이를 재구현하지 않고 **지사-DID 중복 연결 방지**와 **착신 경로 분류 표시**만 추가한다.
- **자정 넘는 시간 범위 의미론:** 시작 요일부터 다음 요일 새벽까지 **연속**으로 적용한다. 예: 월요일 22:00~06:00 → 월요일에 `22:00-23:59`, **화요일**에 `00:00-06:00` 두 구간을 발행한다(요일 롤오버: sun→mon, sat→sun 등). 운영자 직관 "월요일 밤이 화요일 새벽까지 이어진다"를 따른다.
- **distributionMode → PBX queue strategy 매핑:** `SEQUENTIAL`/`UNCONDITIONAL` → `linear`, `DISTRIBUTE` → 선택한 고급 전략(rrmemory/leastrecent/fewestcalls/random, 기본 leastrecent). 서비스가 저장 시점에 `strategy` 컬럼을 확정하므로 `queues.renderer.ts`는 변경하지 않는다.
- `apps/admin`은 Vitest, 컴포넌트는 `react-dom/server`의 `renderToStaticMarkup` 정적 마크업 검증 + `vi.mock`으로 `apiClient`/`usePermissionStore` 모킹(`BranchSettingsPage.test.tsx` 패턴). 상호작용은 수동 스모크.
- `apps/server`는 Jest, `*.spec.ts`, 렌더러는 순수 함수 spec(`dialplan.renderer.spec.ts` 패턴).
- Prisma 마이그레이션 적용에는 로컬 Postgres가 필요하다: `docker compose up -d postgres redis`.

## File Structure

| 파일 | 책임 | 작업 |
|---|---|---|
| `apps/admin/src/shared/help/*` | 도움말 공통 컴포넌트(7개 파일) | 생성 — 도움말 명세서 Task 1~6 |
| `apps/server/src/modules/admin/branch-did-route.ts` | DID 착신 경로 분류 순수 함수 | 생성 |
| `apps/server/src/modules/admin/branch-did-route.spec.ts` | 위 단위 테스트 | 생성 |
| `apps/server/src/modules/admin/admin.service.ts` | `getBranchMappings`/`updateBranchMappings` 보강 | 수정 |
| `apps/server/test/admin.service.branch-did.spec.ts` | 지사-DID 충돌 단위 테스트 | 생성 |
| `apps/server/prisma/migrations/20260520_branch_did_global_unique/migration.sql` | 지사-DID 글로벌 유니크 | 생성 |
| `apps/admin/src/features/branch-settings/BranchMappingsModal.tsx` | 지사 DID 착신 경로 표시 + 도움말 | 수정 |
| `apps/server/prisma/schema.prisma` | `branchDids` 유니크 + `queues.distributionMode` 컬럼 | 수정 |
| `apps/server/prisma/migrations/20260519_queue_distribution_mode/migration.sql` | 외부 착신 방식 마이그레이션 | 생성 |
| `apps/server/src/modules/queues/distribution-mode.ts` | distributionMode→strategy 매핑 순수 함수 | 생성 |
| `apps/server/src/modules/queues/distribution-mode.spec.ts` | 위 단위 테스트 | 생성 |
| `apps/server/src/modules/queues/dto/create-queue.dto.ts` `update-queue.dto.ts` | `distributionMode` 필드 | 수정 |
| `apps/server/src/modules/queues/queues.service.ts` | distributionMode 저장 + strategy 확정 | 수정 |
| `apps/admin/src/features/queue-settings/queueStrategy.ts` | 외부 착신 방식 옵션 | 수정 |
| `apps/admin/src/features/queue-settings/QueueCreateModal.tsx` `QueueEditModal.tsx` `QueueSettingsPage.tsx` | 외부 착신 방식 UI + 도움말 | 수정 |
| `apps/server/src/modules/asterisk-config/asterisk-config.service.ts` | `normalizeForwardingSchedules` 자정 허용 | 수정 |
| `apps/server/src/modules/asterisk-config/renderers/dialplan.renderer.ts` | 자정 넘는 구간 GotoIfTime 분할 | 수정 |
| `apps/server/src/modules/asterisk-config/renderers/dialplan.renderer.spec.ts` | 자정 넘는 구간 테스트 | 수정 |
| `apps/admin/src/features/forwarding-settings/ForwardingRuleModal.tsx` | 자정 검증 완화 + 도움말 | 수정 |

---

## Chunk 1: 도움말 공통 컴포넌트 기반

도움말 명세서(`docs/superpowers/plans/2026-05-19-pbx-feature-help.md`)에 7개 도움말 파일의 **완전한 코드**가 이미 작성되어 있다. 본 청크는 그 명세서의 **Task 1~6(Chunk 1~3)** 을 그대로 실행해 컴포넌트 기반을 만든다. 코드를 여기 복제하지 않는다(DRY).

### Task 1: 도움말 컴포넌트 생성

**Files:**
- Create: `apps/admin/src/shared/help/types.ts`
- Create: `apps/admin/src/shared/help/pbxFeatureHelp.generated.json`
- Create: `apps/admin/src/shared/help/featureHelp.ts` (+ `.test.ts`)
- Create: `apps/admin/src/shared/help/FeatureHelpPanelBody.tsx` (+ `.test.tsx`)
- Create: `apps/admin/src/shared/help/FeatureHelpPanel.tsx`
- Create: `apps/admin/src/shared/help/FeatureHelpButton.tsx` (+ `.test.tsx`)
- Create: `apps/admin/src/shared/help/index.ts`
- Modify: `apps/admin/.env.example`

- [x] **Step 1: 도움말 명세서 Task 1~6 실행**

`docs/superpowers/plans/2026-05-19-pbx-feature-help.md`의 Task 1~6을 명세서에 적힌 코드와 커밋 메시지 그대로 수행한다. (Task 7 "6개 화면 적용"과 Chunk 5 "빌드 스크립트"는 본 플랜 범위 밖 — **실행하지 않는다**.)

- [x] **Step 2: 도움말 시드 JSON에 기능 1~3 키 존재 확인**

Run (cwd `apps/admin`):

```bash
node -e "const d=require('./src/shared/help/pbxFeatureHelp.generated.json'); ['branch.inboundPolicy','queue.externalInboundMode','forwarding.condition'].forEach(k=>{ if(!d[k]) throw new Error('missing '+k); }); console.log('help keys OK');"
```

Expected: `help keys OK` (3개 키 모두 `APPROVED` 상태로 시드되어 있음 — 명세서 Task 2).

- [x] **Step 3: 도움말 테스트/빌드 확인**

Run (cwd `apps/admin`): `npx vitest run src/shared/help/ && npx tsc -b`
Expected: 도움말 테스트 전부 PASS, 타입 오류 0.

---

## Chunk 2: 기능 1 — 지사별 DID/ARS/착신 정책

지사에 연결된 DID마다 착신 경로(ARS / 직접 분배룰 / 착신전환 / 미설정)를 분류해 응답·화면에 노출하고, 동일 DID가 둘 이상의 지사에 연결되지 않도록 검증한다.

### Task 2: DID 착신 경로 분류 순수 함수

**Files:**
- Create: `apps/server/src/modules/admin/branch-did-route.ts`
- Test: `apps/server/src/modules/admin/branch-did-route.spec.ts`

- [x] **Step 1: 실패 테스트 작성**

```ts
// apps/server/src/modules/admin/branch-did-route.spec.ts
import { classifyDidInboundRoute } from './branch-did-route';

describe('classifyDidInboundRoute', () => {
  it('착신전환 규칙이 있으면 FORWARDING (다른 경로보다 우선)', () => {
    expect(
      classifyDidInboundRoute({ ivrMenuId: 'ivr-1', directQueue: 'sales', hasForwardingRule: true }),
    ).toBe('FORWARDING');
  });
  it('ivrMenuId 가 있으면 ARS', () => {
    expect(
      classifyDidInboundRoute({ ivrMenuId: 'ivr-1', directQueue: null, hasForwardingRule: false }),
    ).toBe('ARS');
  });
  it('directQueue 만 있으면 DIRECT_QUEUE', () => {
    expect(
      classifyDidInboundRoute({ ivrMenuId: null, directQueue: 'sales', hasForwardingRule: false }),
    ).toBe('DIRECT_QUEUE');
  });
  it('아무 경로도 없으면 NONE', () => {
    expect(
      classifyDidInboundRoute({ ivrMenuId: null, directQueue: null, hasForwardingRule: false }),
    ).toBe('NONE');
  });
});
```

- [x] **Step 2: 테스트 실패 확인**

Run (cwd `apps/server`): `npx jest src/modules/admin/branch-did-route.spec.ts`
Expected: FAIL — `classifyDidInboundRoute` 미정의.

- [x] **Step 3: 최소 구현 작성**

```ts
// apps/server/src/modules/admin/branch-did-route.ts

/** 지사에 연결된 DID 하나의 인입 착신 경로 분류. */
export type DidInboundRoute = 'ARS' | 'DIRECT_QUEUE' | 'FORWARDING' | 'NONE';

export interface DidRouteFacts {
  ivrMenuId: string | null;
  directQueue: string | null;
  hasForwardingRule: boolean;
}

/**
 * 착신 경로 우선순위: 착신전환 > ARS > 직접 분배룰 > 미설정.
 * 렌더러(renderDidStandardRoute)가 ALWAYS 착신전환 규칙을 DID 기본 경로보다
 * 먼저 적용하므로, 분류도 FORWARDING 을 최우선으로 둔다.
 */
export function classifyDidInboundRoute(facts: DidRouteFacts): DidInboundRoute {
  if (facts.hasForwardingRule) return 'FORWARDING';
  if (facts.ivrMenuId) return 'ARS';
  if (facts.directQueue) return 'DIRECT_QUEUE';
  return 'NONE';
}
```

- [x] **Step 4: 테스트 통과 확인**

Run: `npx jest src/modules/admin/branch-did-route.spec.ts`
Expected: PASS (4 tests).

- [x] **Step 5: 커밋**

```bash
git add apps/server/src/modules/admin/branch-did-route.ts apps/server/src/modules/admin/branch-did-route.spec.ts
git commit -m "feat(server): add DID inbound route classifier"
```

### Task 3: `getBranchMappings` 응답에 DID 착신 경로 추가

`getBranchMappings`가 반환하는 `availableDids` 각 항목에 `inboundRoute`를 추가한다. DID 조회에 `ivrMenuId`/`directQueue` 컬럼을 추가하고, 이미 조회 중인 `forwardingRules`로 착신전환 보유 여부를 판단한다.

**Files:**
- Modify: `apps/server/src/modules/admin/admin.service.ts` (`getBranchMappings`)

- [x] **Step 1: DID 조회 select 확장**

`getBranchMappings` 안의 `this.prisma.asteriskDid.findMany` 호출(`availableDids` 용)의 `select`를 다음으로 바꾼다:

```ts
      this.prisma.asteriskDid.findMany({
        where: { tenantId, enabled: true },
        orderBy: [{ did: 'asc' }],
        select: {
          id: true,
          did: true,
          description: true,
          ivrMenuId: true,
          directQueue: true,
        },
      }),
```

- [x] **Step 2: import 추가**

`admin.service.ts` 상단 import 영역에 추가:

```ts
import { classifyDidInboundRoute } from './branch-did-route';
```

- [x] **Step 3: 응답의 `availableDids` 매핑 변경**

`getBranchMappings`의 `return { success: true, data: { ... } }` 블록에서 `availableDids: dids,` 를 다음으로 교체한다 (`forwardingRules`는 같은 메서드에서 이미 조회됨):

```ts
        availableDids: (() => {
          const didIdsWithForwarding = new Set(forwardingRules.map((rule) => rule.did.id));
          return dids.map((did) => ({
            id: did.id,
            did: did.did,
            description: did.description,
            inboundRoute: classifyDidInboundRoute({
              ivrMenuId: did.ivrMenuId,
              directQueue: did.directQueue,
              hasForwardingRule: didIdsWithForwarding.has(did.id),
            }),
          }));
        })(),
```

- [x] **Step 4: 빌드 확인**

Run (cwd `apps/server`): `npx tsc --noEmit`
Expected: 타입 오류 0.

- [x] **Step 5: 커밋**

```bash
git add apps/server/src/modules/admin/admin.service.ts
git commit -m "feat(server): include DID inbound route in branch mappings"
```

### Task 4: 지사-DID 중복 연결 방지 (DB 유니크 + 서비스 + 단위 테스트)

동일 DID가 둘 이상의 지사에 연결되지 않도록 **DB 유니크 인덱스로 보장**하고, 서비스 검증으로 운영자 친화 메시지를 제공한다. 서비스만으로는 동시 저장이나 우회 경로를 막을 수 없으므로 DB 제약이 최종 방어선이다.

**Files:**
- Modify: `apps/server/prisma/schema.prisma` (`branchDids` 모델)
- Create: `apps/server/prisma/migrations/20260520_branch_did_global_unique/migration.sql`
- Modify: `apps/server/src/modules/admin/admin.service.ts` (`updateBranchMappings`)
- Create: `apps/server/test/admin.service.branch-did.spec.ts`

- [x] **Step 1: schema 에 글로벌 유니크 추가**

`apps/server/prisma/schema.prisma`의 `branchDids` 모델에서 기존 `@@unique([branchId, didId])` 줄 바로 아래에 추가한다:

```prisma
  @@unique([tenantId, didId])
```

> 의미: 동일 테넌트 안에서 한 DID는 최대 한 지사에만 연결될 수 있다. 동시 저장이나 우회 경로에서도 DB가 거절한다.

- [x] **Step 2: 마이그레이션 SQL 작성**

`apps/server/prisma/migrations/20260520_branch_did_global_unique/migration.sql` 생성:

```sql
-- 동일 테넌트 내 DID 가 둘 이상의 지사에 연결되지 않도록 보장
CREATE UNIQUE INDEX "branchDids_tenantId_didId_key" ON "branchDids" ("tenantId", "didId");
```

> 사전 점검: `SELECT "tenantId","didId",COUNT(*) FROM "branchDids" GROUP BY 1,2 HAVING COUNT(*)>1;` 로 중복 매핑이 없는지 확인. 운영 데이터가 있으면 정리 후 진행(개발 DB에서는 보통 비어 있음).

- [x] **Step 3: 마이그레이션 적용**

Postgres 가 기동 상태인지 확인하고(없으면 `docker compose up -d postgres redis`) Run (cwd `apps/server`):

```bash
npx prisma migrate deploy
```

Expected: 마이그레이션 `20260520_branch_did_global_unique` 적용 성공.

- [x] **Step 4: Prisma Client 재생성**

Run (cwd `apps/server`):

```bash
npx prisma generate
```

Expected: 클라이언트 재생성 성공.

- [x] **Step 5: 실패 테스트 작성 (RED)**

`apps/server/test/admin.service.optout.spec.ts`의 `createService()` 모킹 패턴을 따라 새 spec을 만든다.

```ts
// apps/server/test/admin.service.branch-did.spec.ts
import { BadRequestException } from '@nestjs/common';
import { AdminService } from '../src/modules/admin/admin.service';

function createService() {
  const prisma = {
    branches: { findFirst: jest.fn() },
    branchDids: { findMany: jest.fn() },
    $transaction: jest.fn(),
  } as any;
  const asteriskReloadService = { executeReload: jest.fn() } as any;
  return {
    prisma,
    service: new AdminService(
      prisma,
      {} as any,                          // queuesService
      asteriskReloadService,
      {} as any,                          // healthSummary
      {} as any,                          // realtimeGateway
      { publish: jest.fn() } as any,      // eventBus
    ),
  };
}

describe('AdminService updateBranchMappings DID conflict', () => {
  it('rejects DIDs already linked to another branch with that branch name', async () => {
    const { prisma, service } = createService();
    prisma.branches.findFirst.mockResolvedValueOnce({
      branchId: 'branch-b',
      queueMappings: [],
      didMappings: [],
      settingsProfile: null,
    });
    prisma.branchDids.findMany.mockResolvedValueOnce([
      { branch: { branchName: '본사' } },
    ]);

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-b', { didIds: ['did-1'] } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.branchDids.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        didId: { in: ['did-1'] },
        branchId: { not: 'branch-b' },
      },
      select: { branch: { select: { branchName: true } } },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('skips the conflict check when didIds is omitted', async () => {
    const { prisma, service } = createService();
    prisma.branches.findFirst.mockResolvedValueOnce({
      branchId: 'branch-b',
      queueMappings: [],
      didMappings: [],
      settingsProfile: null,
    });
    prisma.$transaction.mockResolvedValueOnce(undefined);
    const getSpy = jest
      .spyOn(service, 'getBranchMappings')
      .mockResolvedValue({ success: true, data: null as any, error: null });

    await service.updateBranchMappings('tenant-1', 'branch-b', {} as any);

    expect(prisma.branchDids.findMany).not.toHaveBeenCalled();
    getSpy.mockRestore();
  });
});
```

Run (cwd `apps/server`): `npx jest test/admin.service.branch-did.spec.ts`
Expected: 첫 테스트 FAIL — 검증 블록 아직 없음.

- [x] **Step 6: 서비스 검증 블록 추가 (GREEN)**

`updateBranchMappings`에서 `if (!currentMappings) { throw ... }` 직후, `effectiveQueueIds` 계산 이전에 추가한다:

```ts
    if (dto.didIds && dto.didIds.length > 0) {
      const conflictingLinks = await this.prisma.branchDids.findMany({
        where: {
          tenantId,
          didId: { in: dto.didIds },
          branchId: { not: branchId },
        },
        select: { branch: { select: { branchName: true } } },
      });
      if (conflictingLinks.length > 0) {
        const branchNames = [
          ...new Set(conflictingLinks.map((link) => link.branch.branchName)),
        ];
        throw new BadRequestException(
          `이미 다른 지사(${branchNames.join(', ')})에 연결된 DID가 있어 저장할 수 없습니다.`,
        );
      }
    }
```

> `BadRequestException`은 `admin.service.ts`에 이미 import 되어 있다. `branchDids` 모델에는 `branch` 관계가 정의돼 있다. DB 유니크가 최종 방어선이지만, 사전 검사로 운영자에게 충돌 지사명을 알려준다.

- [x] **Step 7: 테스트/빌드 통과 확인**

Run: `npx jest test/admin.service.branch-did.spec.ts && npx tsc --noEmit`
Expected: 두 테스트 PASS, 타입 오류 0.

- [x] **Step 8: 커밋**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/20260520_branch_did_global_unique apps/server/src/modules/admin/admin.service.ts apps/server/test/admin.service.branch-did.spec.ts
git commit -m "feat(server): enforce branch-DID uniqueness and add conflict guard"
```

### Task 5: 관리자 UI — 지사 DID 착신 경로 표시 + 도움말

**Files:**
- Modify: `apps/admin/src/features/branch-settings/BranchMappingsModal.tsx`

- [x] **Step 1: `availableDids` 타입에 `inboundRoute` 추가**

`MappingResponse` 인터페이스의 `availableDids` 줄을 교체한다:

```ts
  availableDids: Array<{
    id: string;
    did: string;
    description?: string | null;
    inboundRoute: 'ARS' | 'DIRECT_QUEUE' | 'FORWARDING' | 'NONE';
  }>;
```

- [x] **Step 2: 착신 경로 라벨 상수 추가**

파일 상단 `FORWARD_TYPE_LABEL` 상수 옆에 추가:

```ts
const DID_ROUTE_META: Record<string, { label: string; color: string }> = {
  ARS: { label: 'ARS 메뉴', color: 'blue' },
  DIRECT_QUEUE: { label: '직접 분배룰', color: 'green' },
  FORWARDING: { label: '착신전환', color: 'gold' },
  NONE: { label: '착신 정책 미설정', color: 'red' },
};
```

- [x] **Step 3: import 에 `FeatureHelpButton` 추가**

```ts
import { FeatureHelpButton } from '../../shared/help';
```

- [x] **Step 4: DID 라벨에 착신 경로 표기 + DID 요약**

`didOptions` 계산을 다음으로 교체해 라벨 끝에 경로를 표기한다:

```ts
  const didOptions = useMemo(
    () =>
      (data?.availableDids ?? []).map((did) => ({
        value: did.id,
        label: `${did.description ? `${formatPhoneNumber(did.did)} (${did.description})` : formatPhoneNumber(did.did)} · ${DID_ROUTE_META[did.inboundRoute].label}`,
      })),
    [data?.availableDids],
  );
```

`인입 DID` Form.Item 아래(같은 Card 안)에 선택된 DID들의 착신 경로 요약을 추가한다. `didIds` 폼 값을 watch 한다 — 컴포넌트 상단 watch 영역에 추가:

```ts
  const selectedDidIds = Form.useWatch('didIds', form) ?? [];
```

`인입 DID` Form.Item 바로 다음(닫는 `</Form.Item>` 뒤, `</Card>` 앞)에 삽입:

```tsx
                  {selectedDidIds.length > 0 ? (
                    <Space wrap size={[8, 8]} style={{ marginTop: 4 }}>
                      {selectedDidIds.map((didId) => {
                        const did = data?.availableDids.find((item) => item.id === didId);
                        if (!did) return null;
                        const meta = DID_ROUTE_META[did.inboundRoute];
                        return (
                          <Tag key={didId} color={meta.color}>
                            {formatPhoneNumber(did.did)} · {meta.label}
                          </Tag>
                        );
                      })}
                    </Space>
                  ) : null}
```

> `Tag`, `Space`는 이 파일에서 이미 import 되어 있다.

- [x] **Step 5: 모달 제목에 도움말 버튼 적용**

`<Modal title={...}>` 의 `title` prop을 다음으로 교체한다:

```tsx
      title={
        <Space align="center">
          <span>{branch ? `지사 운영 설정: ${branch.branchName}` : '지사 운영 설정'}</span>
          <FeatureHelpButton featureKey="branch.inboundPolicy" featureName="지사별 착신 정책" />
        </Space>
      }
```

- [x] **Step 6: 빌드/기존 테스트 확인**

Run (cwd `apps/admin`): `npx tsc -b && npx vitest run`
Expected: 타입 오류 0, 기존 테스트 전부 PASS.

- [x] **Step 7: 수동 스모크**

`npm run dev -- --port 5174` 후 지사 운영 설정 모달에서 확인:
- 인입 DID 셀렉트의 각 옵션 라벨 끝에 착신 경로(ARS/직접 분배룰/착신전환/미설정)가 표기된다.
- DID 선택 시 아래에 경로 태그가 나타난다.
- 모달 제목 옆 물음표 아이콘 클릭 시 도움말 Drawer가 열린다.

- [x] **Step 8: 커밋**

```bash
git add apps/admin/src/features/branch-settings/BranchMappingsModal.tsx
git commit -m "feat(admin): show DID inbound route and help in branch mappings"
```

---

## Chunk 3: 기능 2 — 외부 착신 방식 정의

외부 착신 방식(순차/분배/무조건)을 `queues.distributionMode` 전용 컬럼으로 저장하고 PBX queue strategy로 매핑한다.

### Task 6: Prisma 스키마 — `distributionMode` 컬럼

**Files:**
- Modify: `apps/server/prisma/schema.prisma` (`queues` 모델)
- Create: `apps/server/prisma/migrations/20260519_queue_distribution_mode/migration.sql`

- [x] **Step 1: 스키마에 컬럼 추가**

`apps/server/prisma/schema.prisma`의 `queues` 모델에서 `strategy` 줄 바로 아래에 추가:

```prisma
  distributionMode    String    @default("DISTRIBUTE") @db.VarChar(16)
```

- [x] **Step 2: 마이그레이션 SQL 작성**

`apps/server/prisma/migrations/20260519_queue_distribution_mode/migration.sql` 생성:

```sql
-- 외부 착신 방식(순차/분배/무조건)을 별도 컬럼으로 저장
ALTER TABLE "queues" ADD COLUMN "distributionMode" VARCHAR(16) NOT NULL DEFAULT 'DISTRIBUTE';
```

- [x] **Step 3: 마이그레이션 적용**

Postgres 가 기동 상태인지 확인하고(없으면 `docker compose up -d postgres redis`) Run (cwd `apps/server`):

```bash
npx prisma migrate deploy
```

Expected: 마이그레이션 `20260519_queue_distribution_mode` 적용 성공.

- [x] **Step 4: Prisma Client 재생성**

Run (cwd `apps/server`):

```bash
npx prisma generate
```

Expected: `node_modules/.prisma/client` 의 타입에 `queues.distributionMode` 가 반영됨. **이 단계를 건너뛰면 Task 9 에서 `distributionMode` 사용 시 타입 오류가 발생한다.**

- [x] **Step 5: 커밋**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/20260519_queue_distribution_mode
git commit -m "feat(server): add queues.distributionMode column"
```

### Task 7: distributionMode → strategy 매핑 순수 함수

**Files:**
- Create: `apps/server/src/modules/queues/distribution-mode.ts`
- Test: `apps/server/src/modules/queues/distribution-mode.spec.ts`

- [x] **Step 1: 실패 테스트 작성**

```ts
// apps/server/src/modules/queues/distribution-mode.spec.ts
import { resolveQueueStrategy, isDistributionMode } from './distribution-mode';

describe('resolveQueueStrategy', () => {
  it('SEQUENTIAL 은 linear 로 매핑한다', () => {
    expect(resolveQueueStrategy('SEQUENTIAL', 'rrmemory')).toBe('linear');
  });
  it('UNCONDITIONAL 은 linear 로 매핑한다', () => {
    expect(resolveQueueStrategy('UNCONDITIONAL', 'leastrecent')).toBe('linear');
  });
  it('DISTRIBUTE 는 선택한 분배 전략을 유지한다', () => {
    expect(resolveQueueStrategy('DISTRIBUTE', 'fewestcalls')).toBe('fewestcalls');
  });
  it('DISTRIBUTE 인데 전략이 없거나 분배 계열이 아니면 leastrecent', () => {
    expect(resolveQueueStrategy('DISTRIBUTE')).toBe('leastrecent');
    expect(resolveQueueStrategy('DISTRIBUTE', 'linear')).toBe('leastrecent');
  });
});

describe('isDistributionMode', () => {
  it('유효 값은 true', () => {
    expect(isDistributionMode('SEQUENTIAL')).toBe(true);
  });
  it('무효 값은 false', () => {
    expect(isDistributionMode('ROUNDROBIN')).toBe(false);
  });
});
```

- [x] **Step 2: 테스트 실패 확인**

Run (cwd `apps/server`): `npx jest src/modules/queues/distribution-mode.spec.ts`
Expected: FAIL — 함수 미정의.

- [x] **Step 3: 최소 구현 작성**

```ts
// apps/server/src/modules/queues/distribution-mode.ts

/** 외부 착신 방식. 운영자에게 노출되는 1차 선택지. */
export const DISTRIBUTION_MODES = ['SEQUENTIAL', 'DISTRIBUTE', 'UNCONDITIONAL'] as const;
export type DistributionMode = (typeof DISTRIBUTION_MODES)[number];

/** DISTRIBUTE 모드에서 허용되는 PBX 분배 전략. */
const DISTRIBUTE_STRATEGIES = ['rrmemory', 'leastrecent', 'fewestcalls', 'random'] as const;
const DEFAULT_DISTRIBUTE_STRATEGY = 'leastrecent';

export function isDistributionMode(value: unknown): value is DistributionMode {
  return DISTRIBUTION_MODES.includes(value as DistributionMode);
}

/**
 * 외부 착신 방식 + 고급 전략 → PBX queue strategy.
 * SEQUENTIAL/UNCONDITIONAL 은 우선순위 순서대로 1명씩 호출하므로 linear.
 * DISTRIBUTE 는 선택한 분배 전략을 유지하되, 분배 계열이 아니면 기본값.
 */
export function resolveQueueStrategy(
  mode: DistributionMode,
  advancedStrategy?: string | null,
): string {
  if (mode === 'SEQUENTIAL' || mode === 'UNCONDITIONAL') return 'linear';
  if (advancedStrategy && (DISTRIBUTE_STRATEGIES as readonly string[]).includes(advancedStrategy)) {
    return advancedStrategy;
  }
  return DEFAULT_DISTRIBUTE_STRATEGY;
}
```

- [x] **Step 4: 테스트 통과 확인**

Run: `npx jest src/modules/queues/distribution-mode.spec.ts`
Expected: PASS (6 tests).

- [x] **Step 5: 커밋**

```bash
git add apps/server/src/modules/queues/distribution-mode.ts apps/server/src/modules/queues/distribution-mode.spec.ts
git commit -m "feat(server): add queue distribution mode strategy mapping"
```

### Task 8: 큐 DTO에 `distributionMode` 추가

**Files:**
- Modify: `apps/server/src/modules/queues/dto/create-queue.dto.ts`
- Modify: `apps/server/src/modules/queues/dto/update-queue.dto.ts`

- [x] **Step 1: `CreateQueueDto`에 필드 추가**

`create-queue.dto.ts` 상단 상수 옆에 추가:

```ts
const DISTRIBUTION_MODES = ['SEQUENTIAL', 'DISTRIBUTE', 'UNCONDITIONAL'] as const;
```

`CreateQueueDto`의 `strategy` 필드 바로 아래에 추가:

```ts
  @IsOptional()
  @IsIn(DISTRIBUTION_MODES)
  distributionMode?: string;
```

- [x] **Step 2: `UpdateQueueDto`에 동일 필드 추가**

`update-queue.dto.ts` 상단에 `DISTRIBUTION_MODES` 상수를 동일하게 추가하고, `strategy` 필드 아래에 같은 `distributionMode` 블록을 추가한다.

- [x] **Step 3: 빌드 확인**

Run (cwd `apps/server`): `npx tsc --noEmit`
Expected: 타입 오류 0.

- [x] **Step 4: 커밋**

```bash
git add apps/server/src/modules/queues/dto/create-queue.dto.ts apps/server/src/modules/queues/dto/update-queue.dto.ts
git commit -m "feat(server): add distributionMode to queue DTOs"
```

### Task 9: `QueuesService` — distributionMode 저장 + strategy 확정

**Files:**
- Modify: `apps/server/src/modules/queues/queues.service.ts`

- [x] **Step 1: import 추가**

`queues.service.ts` 상단 import 영역에 추가:

```ts
import { resolveQueueStrategy, type DistributionMode } from './distribution-mode';
```

- [x] **Step 2: `create`에서 distributionMode 저장 + strategy 확정**

`create` 메서드의 `tx.queues.create` 호출 `data` 블록에서 `strategy: dto.strategy ?? 'leastrecent',` 줄을 다음으로 교체한다:

```ts
          distributionMode: dto.distributionMode ?? 'DISTRIBUTE',
          strategy: resolveQueueStrategy(
            (dto.distributionMode ?? 'DISTRIBUTE') as DistributionMode,
            dto.strategy,
          ),
```

같은 `create` 메서드의 `select` 블록에 `distributionMode: true,`를 추가한다.

- [x] **Step 3: `update`에서 distributionMode 반영**

`update` 메서드의 `tx.queues.update` 호출 `data` 블록에서 `...(dto.strategy !== undefined && { strategy: dto.strategy }),` 줄을 다음으로 교체한다:

```ts
          ...(dto.distributionMode !== undefined && {
            distributionMode: dto.distributionMode,
            strategy: resolveQueueStrategy(
              dto.distributionMode as DistributionMode,
              dto.strategy,
            ),
          }),
          ...(dto.distributionMode === undefined &&
            dto.strategy !== undefined && { strategy: dto.strategy }),
```

> 의미: 외부 착신 방식이 함께 오면 그 방식 기준으로 strategy를 재계산한다. 방식 변경 없이 고급 전략만 바뀌면 strategy만 갱신한다.

같은 `update` 메서드의 `select` 블록에 `distributionMode: true,`를 추가한다.

- [x] **Step 4: `listSettings` select 확장**

`listSettings`의 `this.prisma.queues.findMany` `select` 블록에 `distributionMode: true,`를 추가한다 (UI 테이블 표시용).

- [x] **Step 5: 빌드 확인**

Run (cwd `apps/server`): `npx tsc --noEmit`
Expected: 타입 오류 0.

- [x] **Step 6: 커밋**

```bash
git add apps/server/src/modules/queues/queues.service.ts
git commit -m "feat(server): persist distributionMode and derive queue strategy"
```

### Task 10: 관리자 UI — 외부 착신 방식 옵션 상수

**Files:**
- Modify: `apps/admin/src/features/queue-settings/queueStrategy.ts`

- [x] **Step 1: 외부 착신 방식 옵션/라벨 추가**

`queueStrategy.ts` 끝에 추가:

```ts
export const DISTRIBUTION_MODE_OPTIONS = [
  { value: 'SEQUENTIAL', label: '순차 착신' },
  { value: 'DISTRIBUTE', label: '분배 착신' },
  { value: 'UNCONDITIONAL', label: '무조건 착신' },
];

const DISTRIBUTION_MODE_LABEL_MAP = Object.fromEntries(
  DISTRIBUTION_MODE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<string, string>;

export function getDistributionModeLabel(mode?: string | null) {
  if (!mode) return '분배 착신';
  return DISTRIBUTION_MODE_LABEL_MAP[mode] ?? mode;
}
```

- [x] **Step 2: 커밋**

```bash
git add apps/admin/src/features/queue-settings/queueStrategy.ts
git commit -m "feat(admin): add external inbound mode options"
```

### Task 11: 관리자 UI — 호 분배룰 생성 모달에 외부 착신 방식

`QueueCreateModal`에 1차 선택지 "외부 착신 방식" 라디오를 추가하고, 기존 "분배 전략"은 `DISTRIBUTE`일 때만 활성화되는 고급 옵션으로 낮춘다.

**Files:**
- Modify: `apps/admin/src/features/queue-settings/QueueCreateModal.tsx`

- [x] **Step 1: import 변경**

```ts
import { DISTRIBUTION_MODE_OPTIONS, QUEUE_STRATEGY_OPTIONS } from './queueStrategy';
import { FeatureHelpButton } from '../../shared/help';
```

`antd` import 목록에 `Radio`를 추가한다.

- [x] **Step 2: 폼 타입과 초기값에 `distributionMode` 추가**

`Form.useForm` 제네릭 객체 타입에 추가:

```ts
    distributionMode?: string;
```

`<Form ... initialValues={{ ... }}>`의 `initialValues`에 `distributionMode: 'DISTRIBUTE',`를 추가한다.

- [x] **Step 3: distributionMode watch + 기본 설정 카드 수정**

컴포넌트 본문 `const [form] = Form.useForm...` 아래에 추가:

```ts
  const distributionMode = Form.useWatch('distributionMode', form) ?? 'DISTRIBUTE';
```

"기본 설정" `Card`의 그리드(`<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, ...)' }}>`) 안에서 기존 "분배 전략" `Form.Item`을 다음 두 항목으로 교체한다 — 외부 착신 방식이 1차, 분배 전략은 `DISTRIBUTE`일 때만 활성:

```tsx
              <Form.Item label="외부 착신 방식" name="distributionMode" style={{ marginBottom: 0 }}>
                <Radio.Group optionType="button" buttonStyle="solid" options={DISTRIBUTION_MODE_OPTIONS} />
              </Form.Item>
              <Form.Item label="분배 전략 (고급)" name="strategy" style={{ marginBottom: 0 }}>
                <Select options={QUEUE_STRATEGY_OPTIONS} disabled={distributionMode !== 'DISTRIBUTE'} />
              </Form.Item>
```

- [x] **Step 4: 모달 제목에 도움말 버튼**

`<Modal title="신규 호 분배룰 생성" ...>`의 `title`을 교체한다:

```tsx
      title={
        <Space align="center">
          <span>신규 호 분배룰 생성</span>
          <FeatureHelpButton featureKey="queue.externalInboundMode" featureName="외부 착신 방식" />
        </Space>
      }
```

> `Space`는 이 파일에서 이미 import 되어 있다.

- [x] **Step 5: 빌드 확인**

Run (cwd `apps/admin`): `npx tsc -b`
Expected: 타입 오류 0.

- [x] **Step 6: 커밋**

```bash
git add apps/admin/src/features/queue-settings/QueueCreateModal.tsx
git commit -m "feat(admin): add external inbound mode to queue create modal"
```

### Task 12: 관리자 UI — 호 분배룰 수정 모달 + 목록

**Files:**
- Modify: `apps/admin/src/features/queue-settings/QueueEditModal.tsx`
- Modify: `apps/admin/src/features/queue-settings/QueueSettingsPage.tsx`

- [x] **Step 1: `QueueEditModal.tsx` 먼저 읽기**

`QueueEditModal.tsx` 전체를 읽어 폼 필드 구성과 `strategy` 입력 위치를 파악한다.

- [x] **Step 2: 수정 모달에 외부 착신 방식 적용**

Task 11과 동일 패턴으로 `QueueEditModal.tsx`를 수정한다:
- `DISTRIBUTION_MODE_OPTIONS`, `Radio` import.
- 폼 타입/초기값(편집 대상 큐의 `distributionMode` ?? `'DISTRIBUTE'`)에 `distributionMode` 추가.
- `distributionMode` watch 추가.
- 기존 "분배 전략" 입력을 "외부 착신 방식" 라디오 + "분배 전략 (고급)" (DISTRIBUTE일 때만 활성)으로 교체.
- `QueueRow` 인터페이스(또는 편집 대상 타입)에 `distributionMode?: string`를 추가해 초기값으로 사용.

> 편집 저장 시 폼이 `distributionMode`와 `strategy`를 함께 PATCH/PUT 페이로드에 담아야 한다. 기존 저장 코드가 폼 값 전체를 전송하면 자동 포함된다 — 전송 필드를 명시적으로 골라 담는 코드라면 `distributionMode`를 추가한다.

- [x] **Step 3: `QueueSettingsPage.tsx` 테이블에 외부 착신 방식 열 추가**

`QueueSettingsPage.tsx`에서:
- import: `import { getDistributionModeLabel } from './queueStrategy';`
- `QueueRow`(목록 행 타입)에 `distributionMode?: string` 추가.
- 테이블 `columns`의 기존 "분배 전략" 열 옆(또는 앞)에 "외부 착신 방식" 열을 추가:

```tsx
        {
          title: '외부 착신 방식',
          dataIndex: 'distributionMode',
          render: (value: string | undefined) => <Tag>{getDistributionModeLabel(value)}</Tag>,
        },
```

> `Tag`가 이 파일에 import 돼 있지 않으면 `antd` import에 추가한다.

- [x] **Step 4: 페이지 헤드에 도움말 버튼**

`QueueSettingsPage.tsx`의 페이지 제목 영역에 `FeatureHelpButton`을 추가한다. 화면이 `AdmPageHead`를 쓰면 `right` 슬롯에, `Typography.Title`을 직접 쓰면 제목을 `<Space align="center">`로 감싸 옆에 둔다:

```tsx
import { FeatureHelpButton } from '../../shared/help';
// 제목 옆:
<FeatureHelpButton featureKey="queue.externalInboundMode" featureName="외부 착신 방식" />
```

- [x] **Step 5: 빌드/기존 테스트 확인**

Run (cwd `apps/admin`): `npx tsc -b && npx vitest run`
Expected: 타입 오류 0, 기존 테스트 전부 PASS.

- [x] **Step 6: 수동 스모크**

`npm run dev -- --port 5174` 후:
- 호 분배룰 생성/수정 모달에서 "외부 착신 방식" 라디오가 보이고, `분배 착신`이 아닐 때 "분배 전략 (고급)" 셀렉트가 비활성화된다.
- `순차 착신`으로 큐를 만든 뒤 목록 "외부 착신 방식" 열에 `순차 착신`이 표시된다.
- 페이지/모달의 도움말 아이콘이 동작한다.

- [x] **Step 7: 커밋**

```bash
git add apps/admin/src/features/queue-settings/QueueEditModal.tsx apps/admin/src/features/queue-settings/QueueSettingsPage.tsx
git commit -m "feat(admin): show external inbound mode in queue edit and list"
```

---

## Chunk 4: 기능 3 — 착신전환 조건 자정 넘는 구간 지원

서버 검증·렌더러·UI가 자정을 넘는 시간 범위(예: 22:00~06:00)를 허용하도록 한다.

### Task 13: 서버 검증 — 자정 넘는 구간 허용

`normalizeForwardingSchedules`가 `timeStart >= timeEnd`를 거부하던 것을 `timeStart === timeEnd`만 거부하도록 완화한다.

**Files:**
- Modify: `apps/server/src/modules/asterisk-config/asterisk-config.service.ts`

- [x] **Step 1: 검증 완화**

`normalizeForwardingSchedules` 메서드 안의 다음 블록을:

```ts
      if (timeStart >= timeEnd) {
        throw new BadRequestException('timeStart must be earlier than timeEnd');
      }
```

다음으로 교체한다:

```ts
      if (timeStart === timeEnd) {
        throw new BadRequestException('timeStart and timeEnd must not be identical');
      }
      // timeStart > timeEnd 는 자정을 넘는 구간으로 허용한다 (예: 22:00~06:00).
```

- [x] **Step 2: 빌드 확인**

Run (cwd `apps/server`): `npx tsc --noEmit`
Expected: 타입 오류 0.

- [x] **Step 3: 커밋**

```bash
git add apps/server/src/modules/asterisk-config/asterisk-config.service.ts
git commit -m "feat(server): allow cross-midnight forwarding time ranges"
```

### Task 14: 렌더러 — 자정 넘는 구간 GotoIfTime 분할 (테스트 먼저)

`renderDidStandardRoute`의 조건부 착신전환 렌더링이 `timeStart > timeEnd`이면 `GotoIfTime`을 두 구간(`timeStart-23:59`, `00:00-timeEnd`)으로 분할한다.

**Files:**
- Modify: `apps/server/src/modules/asterisk-config/renderers/dialplan.renderer.spec.ts`
- Modify: `apps/server/src/modules/asterisk-config/renderers/dialplan.renderer.ts`

- [x] **Step 1: 실패 테스트 작성**

`dialplan.renderer.spec.ts`의 `'renders multiple conditional forwarding windows from scheduleJson'` 테스트 바로 뒤에 추가한다. 기존 조건부 테스트들의 입력 형태(`dids` + `forwardingRules` + `scheduleJson`)를 그대로 따른다:

```ts
  it('splits a cross-midnight forwarding window across two weekdays', () => {
    // 월요일 22:00 시작, 종료 06:00 → 월요일 (22:00-23:59) + 화요일 (00:00-06:00).
    const { extensionsInbound } = renderInboundDialplan({
      ivrMenus: [],
      dids: [{ id: 'd-night', did: '07066667777', ivrMenuId: null, directQueue: 'sales', enabled: true, description: null }],
      forwardingRules: [
        {
          id: 'f-night',
          didId: 'd-night',
          forwardType: 'QUEUE',
          targetValue: 'night-desk',
          forwardTriggerMode: 'IMMEDIATE',
          conditionType: 'TIME_RANGE',
          timeStart: null,
          timeEnd: null,
          daysOfWeek: null,
          scheduleJson: JSON.stringify([
            { conditionType: 'TIME_RANGE', timeStart: '22:00', timeEnd: '06:00', daysOfWeek: ['mon'] },
          ]),
          enabled: true,
        },
      ],
    });
    expect(extensionsInbound).toContain('GotoIfTime(22:00-23:59,mon,*,*?forwarding-rule-f-night,s,1)');
    expect(extensionsInbound).toContain('GotoIfTime(00:00-06:00,tue,*,*?forwarding-rule-f-night,s,1)');
    // 같은 요일에 새벽 구간이 잘못 발행되지 않도록 확인.
    expect(extensionsInbound).not.toContain('GotoIfTime(00:00-06:00,mon,');
  });

  it('rolls Sunday cross-midnight window over to Monday', () => {
    const { extensionsInbound } = renderInboundDialplan({
      ivrMenus: [],
      dids: [{ id: 'd-sun', did: '07088889999', ivrMenuId: null, directQueue: 'sales', enabled: true, description: null }],
      forwardingRules: [
        {
          id: 'f-sun',
          didId: 'd-sun',
          forwardType: 'QUEUE',
          targetValue: 'night-desk',
          forwardTriggerMode: 'IMMEDIATE',
          conditionType: 'TIME_RANGE',
          timeStart: null,
          timeEnd: null,
          daysOfWeek: null,
          scheduleJson: JSON.stringify([
            { conditionType: 'TIME_RANGE', timeStart: '23:00', timeEnd: '05:00', daysOfWeek: ['sun'] },
          ]),
          enabled: true,
        },
      ],
    });
    expect(extensionsInbound).toContain('GotoIfTime(23:00-23:59,sun,*,*?forwarding-rule-f-sun,s,1)');
    expect(extensionsInbound).toContain('GotoIfTime(00:00-05:00,mon,*,*?forwarding-rule-f-sun,s,1)');
  });
```

> 호출 함수명/입력 키는 같은 파일의 기존 조건부 테스트(`'renders conditional forwarding rule with DID fallback'`)와 정확히 동일하게 맞춘다. 그 테스트가 쓰는 진입 함수(`renderInboundDialplan` 또는 동등 export)를 그대로 사용한다.

- [x] **Step 2: 테스트 실패 확인**

Run (cwd `apps/server`): `npx jest src/modules/asterisk-config/renderers/dialplan.renderer.spec.ts -t "cross-midnight|rolls Sunday"`
Expected: FAIL — 현재는 단일 `GotoIfTime(22:00-06:00,mon,...)` 한 줄만 발행됨.

- [x] **Step 3: 요일 롤오버 헬퍼 추가**

`dialplan.renderer.ts`에서 `parseForwardingSchedules` 함수 바로 위(또는 아래)에 추가한다. `WEEKDAY_CODES` 와 동일한 순서의 요일 체인을 두고, 자정을 넘는 구간은 시작 요일에 `(시작~23:59)`, **다음 요일**에 `(00:00~종료)`로 분할한다.

```ts
const WEEKDAY_CHAIN = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function nextWeekday(day: string): string {
  const idx = (WEEKDAY_CHAIN as readonly string[]).indexOf(day);
  if (idx < 0) return day; // 알 수 없는 요일은 그대로 둔다(안전망)
  return WEEKDAY_CHAIN[(idx + 1) % WEEKDAY_CHAIN.length];
}

interface TimeWindowSlot {
  range: string;
  day: string;
}

/**
 * 착신전환 시간 구간을 GotoIfTime 슬롯 배열로 변환한다.
 * timeStart < timeEnd  → 같은 요일에 단일 구간.
 * timeStart > timeEnd  → 자정을 넘는 구간으로 보고
 *                         시작 요일에 (시작~23:59), 다음 요일에 (00:00~종료) 두 슬롯.
 *                         "월요일 밤이 화요일 새벽까지 이어진다"는 운영자 직관을 반영.
 */
function expandTimeWindow(timeStart: string, timeEnd: string, day: string): TimeWindowSlot[] {
  if (timeStart < timeEnd) {
    return [{ range: `${timeStart}-${timeEnd}`, day }];
  }
  return [
    { range: `${timeStart}-23:59`, day },
    { range: `00:00-${timeEnd}`, day: nextWeekday(day) },
  ];
}
```

- [x] **Step 4: 조건부 렌더링에서 헬퍼 사용**

`renderDidStandardRoute`의 `schedulesToApply.flatMap(...)` 블록(현재 `GotoIfTime(${schedule.timeStart}-${schedule.timeEnd},...)`를 만드는 부분)을 다음으로 교체한다:

```ts
        ...schedulesToApply.flatMap((schedule) =>
          schedule.daysOfWeek.flatMap((day) =>
            expandTimeWindow(
              schedule.timeStart as string,
              schedule.timeEnd as string,
              day,
            ).map(
              (slot) =>
                ` same => n,GotoIfTime(${slot.range},${slot.day},*,*?forwarding-rule-${forwardingRule.id},s,1)`,
            ),
          ),
        ),
```

> `schedulesToApply`는 `conditionType === 'TIME_RANGE'`로 필터된 항목이므로 `timeStart`/`timeEnd`는 non-null이다.

- [x] **Step 5: 테스트 통과 확인**

Run: `npx jest src/modules/asterisk-config/renderers/dialplan.renderer.spec.ts`
Expected: 신규 cross-midnight 테스트 PASS + 기존 dialplan 렌더러 테스트 전부 PASS(특히 `09:00-12:00` 같은 정상 구간이 단일 줄로 유지되는지).

- [x] **Step 6: 커밋**

```bash
git add apps/server/src/modules/asterisk-config/renderers/dialplan.renderer.ts apps/server/src/modules/asterisk-config/renderers/dialplan.renderer.spec.ts
git commit -m "feat(server): split cross-midnight forwarding window in dialplan renderer"
```

### Task 15: 관리자 UI — 착신전환 모달 자정 검증 완화 + 도움말

**Files:**
- Modify: `apps/admin/src/features/forwarding-settings/ForwardingRuleModal.tsx`

- [x] **Step 1: import 에 `FeatureHelpButton` 추가**

```ts
import { FeatureHelpButton } from '../../shared/help';
```

- [x] **Step 2: `handleOk`의 시간 검증 완화**

`handleOk` 안 `schedules = scheduleRows.map(...)` 블록에서 다음 줄을:

```ts
          if (!item.timeEnd.isAfter(item.timeStart)) {
            throw new Error(`시간대 ${index + 1}의 종료 시간은 시작 시간보다 늦어야 합니다.`);
          }
```

다음으로 교체한다 (자정 넘는 구간 허용, 동일 시각만 거부):

```ts
          if (item.timeStart.format('HH:mm') === item.timeEnd.format('HH:mm')) {
            throw new Error(`시간대 ${index + 1}의 시작/종료 시간이 같을 수 없습니다.`);
          }
```

- [x] **Step 3: 자정 넘는 구간 안내 문구 추가**

"적용 조건" `Card`의 `extra` Typography 문구를 자정 안내를 포함하도록 교체한다:

```tsx
            extra={
              <Typography.Text type="secondary">
                요일·시간대를 여러 개 설정할 수 있습니다. 종료 시간이 시작보다 빠르면 다음 날 새벽까지 연속되는 구간으로 처리됩니다(예: 월요일 22:00~06:00 = 월요일 22:00부터 화요일 06:00까지).
              </Typography.Text>
            }
```

- [x] **Step 4: 모달 제목에 도움말 버튼**

`<Modal title={rule ? '착신전환 수정' : '착신전환 등록'} ...>`의 `title`을 교체한다:

```tsx
      title={
        <Space align="center">
          <span>{rule ? '착신전환 수정' : '착신전환 등록'}</span>
          <FeatureHelpButton featureKey="forwarding.condition" featureName="착신전환 조건" />
        </Space>
      }
```

> `Space`는 이 파일에서 이미 import 되어 있다.

- [x] **Step 5: 빌드/기존 테스트 확인**

Run (cwd `apps/admin`): `npx tsc -b && npx vitest run`
Expected: 타입 오류 0, 기존 테스트 전부 PASS.

- [x] **Step 6: 수동 스모크**

`npm run dev -- --port 5174` 후 착신전환 등록 모달에서:
- "요일/시간 지정" 선택 → 시작 22:00, 종료 06:00 입력 후 저장 시 거부되지 않는다.
- 시작·종료를 같은 시각으로 두면 거부 메시지가 뜬다.
- 모달 제목 옆 도움말 아이콘이 동작한다.

- [x] **Step 7: 커밋**

```bash
git add apps/admin/src/features/forwarding-settings/ForwardingRuleModal.tsx
git commit -m "feat(admin): allow cross-midnight ranges and add help in forwarding modal"
```

---

## 최종 검증 체크리스트

상위 계획서 M1 기능 1~3 및 "테스트 계획" 대조:

- [x] **Prisma Client 동기화** — `schema.prisma` 변경이 두 차례 있다(Chunk 2의 `branchDids` 유니크, Chunk 3의 `queues.distributionMode`). 마지막에 `npx prisma generate` 가 최신 상태인지 확인. 신규 컬럼/제약이 생성된 클라이언트 타입에 반영되어야 한다.
- [x] **서버 전체 테스트 통과** — Run (cwd `apps/server`): `npx jest`. 신규 spec(`branch-did-route`, `admin.service.branch-did`, `distribution-mode`) + 보강된 `dialplan.renderer` + 기존 spec 전부 PASS.
- [x] **서버 빌드** — Run (cwd `apps/server`): `npm run build`. exit 0.
- [x] **관리자 앱 테스트/빌드** — Run (cwd `apps/admin`): `npx tsc -b && npx vitest run`. 타입 오류 0, 도움말 + 기존 테스트 전부 PASS.
- [x] **기능 1** — 지사 운영 설정 모달에서 DID 착신 경로(ARS/직접 분배룰/착신전환/미설정)가 표시되고, 동일 DID를 다른 지사에 연결하면 (a) 서비스가 충돌 지사명을 담은 400으로 거부, (b) 우회로 강제 INSERT 해도 DB 유니크가 거부.
- [x] **기능 2** — 호 분배룰 생성/수정에 외부 착신 방식(순차/분배/무조건)이 1차 선택지로 노출되고, `순차`/`무조건`은 strategy가 `linear`로 저장된다(`resolveQueueStrategy` 테스트로 고정).
- [x] **기능 3** — 착신전환 시간 조건이 22:00~06:00처럼 자정을 넘어도 저장되고, PBX 미리보기에서 시작 요일/다음 요일에 각각 `GotoIfTime` 구간이 렌더된다(월 22:00-23:59 + 화 00:00-06:00).
- [x] **도움말** — 기능 1~3 화면 3곳(지사 운영 설정 모달, 호 분배룰 화면/모달, 착신전환 모달)에서 도움말 아이콘이 보이고 키보드(`Tab`→`Enter`)로 Drawer를 열 수 있다.
- [x] **PBX 반영 경로** — 큐/착신전환 저장 후 PBX 설정 리로드 서비스(`AsteriskReloadService`)의 reload 예약/실행이 호출된다(기존 동작 — 본 플랜이 깨지 않음을 확인).

## 보류 / 후속

- 무조건 착신(UNCONDITIONAL)의 대상 세분 선택(상담원/분배룰/외부번호) UI — 상위 계획서 기능 2 UI 항목, 후속 플랜.
- 도움말 자동 구축 스크립트 + PDF/엑셀 추출 — 도움말 명세서 Chunk 5.
- 지사 화면에서 착신전환 규칙 조건 요약 상세 표기 강화 — 본 플랜은 DID 경로 분류까지만.
