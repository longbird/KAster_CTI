# 어드민 대시보드 & 실시간 통화현황 리디자인 (2026-04-21)

## 목적

`apps/admin` 의 두 화면을 **정보 밀도와 한눈 파악성** 중심으로 개선한다.

- `AdminDashboardPage` (`/dashboard`) — 현재 세로로 5개 블록이 쌓여 1080p 에서 스크롤이 필수. 슈퍼바이저가 한 화면에서 상태를 파악할 수 없음.
- `LiveCallsPage` (`/live-calls`) — 단일 테이블 1개로 상태가 섞여 있어 어느 콜이 어느 단계에 있는지 흐름이 드러나지 않음.

## 컨텍스트 / 결정사항 (브레인스토밍 결과)

| 질문 | 결정 |
|---|---|
| 주 사용 환경 | **슈퍼바이저 데스크탑 1920×1080** (벽걸이 대응은 범위 밖) |
| 대시보드 정보 우선순위 | ① KPI → ⑥ 활성콜 → ③ Queue → ④ 팀 → ⑤ 경보 → ② 추이 |
| 라이브콜 방식 | **상태별 칸반 (Kanban)** — 대기 / 벨울림 / 통화중 / 후처리 |
| 대시보드 레이아웃 | **옵션 C** — KPI+경보 상단 / 상태별 활성콜 중앙 / Queue·팀·추이 슬림 3열 하단 |

## 스코프

### 포함
1. 대시보드 전면 재레이아웃 (CSS Grid)
2. 대시보드 중앙의 **활성콜 테이블 → 상태별 4칸반 미니 카드 리스트** 전환
3. 라이브콜 페이지 전면 재작성 (Table → 상태별 칸반 + 상단 요약 스트립)
4. 공통 `CallCard` 컴포넌트 (대시보드 미니판 + 라이브콜 전체판 재사용)
5. 경과시간 클라이언트 매초 업데이트 (`useNow` 훅)

### 제외 (YAGNI)
- 벽걸이 / 1366px 이하 반응형 — 데스크탑 기준 단일 레이아웃
- 위젯 드래그·재배치
- 칸반 카드 드래그로 콜 재할당
- 새 백엔드 API — 기존 `GET /calls/active`, `GET /admin/dashboard` 재사용
- 신규 자동화 테스트 (현재 admin 에 Jest/Vitest 설정 없음 — 수동 검증 체크리스트로 대체)

## 대시보드 레이아웃 (옵션 C)

```
┌──────────────────────────────────────────────────────────────────┐
│ [헤더 슬림 40px] 콜센터 운영 대시보드 · 지점 필터 · 업데이트시각 · ●LIVE │
├──────────────────────────────────────────────────────────────────┤
│ KPI 6칸 (3fr)                              │ ⚠ 경보 (1fr)          │ 88px
├────────────────────────────────────────────┴──────────────────────┤
│ 🔴 실시간 활성 콜 (총 N건)                                          │
│ ┌ 대기 (3)─┬ 벨울림 (2)─┬ 통화중 (6)─┬ 후처리 (1)──┐                │ ~360px
│ │ CallCard │ CallCard  │ CallCard   │ CallCard    │                │
│ └──────────┴───────────┴────────────┴─────────────┘                │
├───────────────────┬────────────────────┬─────────────────────────┤
│ Queue 요약        │ 팀별 상담원 현황   │ 시간대별 유입 (스파크바) │ 180px
└───────────────────┴────────────────────┴─────────────────────────┘
[InfraStatusBar 하단 슬림 스트립으로 유지]
```

**레이아웃 변경 상세:**

- 기존 `<Space direction="vertical" size={16}>` + `<Row gutter>` 구조 → **CSS Grid** (grid-template-areas 명시)
- KpiCards: `Row/Col` → 6칸 단일 Grid, Statistic 내부를 한 줄 압축 (label / value / delta)
- 경보 패널: 우상단 compact list (level 뱃지 + 메시지 + 상대시간만)
- 하단 3열: Queue / 팀 / 시간대 추이 — 기존 컴포넌트를 `compact` prop 으로 내부 패딩·폰트 축소

## 대시보드: 활성콜 미니 칸반

- **데이터 소스:** 기존 `useDashboardData(branchId).activeCalls` 그대로 사용
- **컴포넌트 신설:** `features/dashboard/components/ActiveCallsKanban.tsx`
- 상태 매핑 (`ActiveCallItem['status']` → 칼럼):
  - `QUEUED` → **대기**
  - `RINGING_AGENT` → **벨울림**
  - `TALKING`, `HOLD` → **통화중**
  - `TRANSFERRING` → **통화중** (서브뱃지로 "전환 중" 표시)
  - `AFTER_CALL_WORK` → **후처리**
  - `NEW` → 대기 (폴백)
- 기존 `ActiveCallsTable.tsx` 는 **삭제** (CallCard 가 더 조밀)

## 라이브콜 페이지: 풀 칸반

```
┌───────────────────────────────────────────────────────────────┐
│ 통화 현황 조회 · [지점][큐][상담원] 필터 · 검색 · ●3초 갱신     │
│ 요약: 활성 12 · 대기 3 · 벨울림 2 · 통화 6 · 후처리 1           │
├───────────────────────────────────────────────────────────────┤
│ ┌ 대기 (3)──┬ 벨울림 (2)─┬ 통화중 (6)──┬ 후처리 (1)────┐         │
│ │ CallCard  │ CallCard   │ CallCard    │ CallCard      │         │
│ │ CallCard  │ CallCard   │ CallCard    │               │         │
│ │ CallCard  │            │ CallCard    │               │         │
│ └───────────┴────────────┴─────────────┴───────────────┘         │
└───────────────────────────────────────────────────────────────┘
```

- 기존 3초 폴링 `GET /calls/active` 유지, 응답을 `sessionStatus` 로 `groupBy`
- 상태 매핑 (`CallRow['sessionStatus']` → 칼럼):
  - `QUEUED` → 대기
  - `RINGING_AGENT` → 벨울림
  - `TALKING` → 통화중
  - `AFTER_CALL_WORK` → 후처리
  - `TRANSFERRING` → 통화중 + `latestTransfer.phase` 뱃지
- 클릭 시 **기존 `CallDetailDrawer` 재사용** (변경 없음)
- **상단 요약 스트립**: 단순 flex, 각 칼럼 건수 + 최장 대기/통화 표시
- **칼럼 내부 스크롤**: 한 칼럼 20건 넘으면 `overflow-y: auto` — 다른 칼럼은 영향 없음

## 공통 CallCard 컴포넌트

**위치:** `apps/admin/src/shared/components/CallCard.tsx`

두 페이지에서 공통 사용. `variant` prop 으로 밀도 조정:

| variant | 사용처 | 특성 |
|---|---|---|
| `mini` | 대시보드 | 고객번호 + 경과시간 + 상담원만 (1줄) |
| `full` | 라이브콜 | 고객번호, 큐, 상담원, 대표번호, 경과시간, 전환 뱃지, quick-action |

**카드 시각 규칙:**
- 경과시간 임계치별 좌측 보더 색상: `≤30s` 초록 / `≤60s` 황 / `>60s` 적
- 전환 진행 중: 상태 뱃지 아래 `TransferPhase` 작은 뱃지
- `canOperate` 권한 있으면 우측 하단 아이콘 (강제종료 등) 표시

**React key 규칙:** 카드는 항상 `key={callId}` 사용. 칼럼 간 이동 시 remount 가 아닌 re-parent 로 동작 (부드러운 전이).

**칼럼 최소 높이:** 한 칼럼만 가득 차서 다른 칼럼이 zero-height 로 쪼그라드는 것을 막기 위해 `min-height: 240px` 고정 (대시보드 미니판은 120px).

## 데이터 / 갱신

- **대시보드:** `useDashboardData(branchId)` 5초 폴링 (기존 유지)
- **라이브콜:** `GET /calls/active` 3초 폴링 (기존 유지)
- **경과시간 계산:** `useNow(1000)` 훅 신설 — `Date.now()` 를 1초마다 `useState` 에 반영. `(now - queuedAt) / 1000` 로 즉시 계산. 폴링과 독립적으로 매초 부드럽게 진행
- **위치:** `apps/admin/src/shared/hooks/useNow.ts`
- **탭 비활성 시 일시정지:** `document.visibilityState === 'hidden'` 이면 tick 중단. 슈퍼바이저가 다른 탭 보는 동안 불필요한 리렌더 방지

## 에러 / 빈 상태

- 폴링 실패: 이전 데이터 보존 + 헤더에 `⚠ 갱신 지연 Ns` (기존 패턴 유지)
- 빈 칼럼: "현재 없음" placeholder + 회색 아이콘
- 첫 로딩: `Skeleton` 유지

## 권한

- `usePermissionStore` 기존 로직 그대로 — quick-action 표시 조건: `liveCallsPermission.canOperate ?? dashboardPermission.canOperate`
- 지점 필터 `BranchFilterSelect` 를 **라이브콜에도** 신규 적용 (현재 없음)

## 상태 매핑 단일화

`ActiveCallItem.status` (대시보드 enum) 과 `CallRow.sessionStatus` (라이브콜 string) 를 **하나의 유틸**로 흡수.

**위치:** `apps/admin/src/shared/lib/callStatusMap.ts`

```ts
export type KanbanColumn = 'queued' | 'ringing' | 'talking' | 'acw';
export function toKanbanColumn(status: string | null | undefined): KanbanColumn;
export const KANBAN_COLUMN_META: Record<KanbanColumn, { label: string; color: string }>;
```

두 페이지와 `CallCard` 모두 이 유틸만 import. 상단 요약 스트립 건수도 같은 `groupBy` 결과에서 derive (별도 reducer 금지).

## 파일 변경

### 신규
- `apps/admin/src/features/dashboard/components/ActiveCallsKanban.tsx`
- `apps/admin/src/shared/components/CallCard.tsx`
- `apps/admin/src/shared/components/CallKanbanColumn.tsx`
- `apps/admin/src/shared/hooks/useNow.ts`
- `apps/admin/src/shared/lib/callStatusMap.ts`

### 수정
- `apps/admin/src/features/dashboard/components/AdminDashboardPage.tsx` (전면 재작성 — Row/Col → CSS Grid)
- `apps/admin/src/features/dashboard/components/KpiCards.tsx` (6칸 조밀 스트립)
- `apps/admin/src/features/dashboard/components/QueueSummaryTable.tsx` (compact prop)
- `apps/admin/src/features/dashboard/components/TeamStatusTable.tsx` (compact prop)
- `apps/admin/src/features/dashboard/components/AlertsPanel.tsx` (compact list 형식)
- `apps/admin/src/features/dashboard/components/TrafficChartCard.tsx` (스파크바 축소 모드)
- `apps/admin/src/features/live-calls/LiveCallsPage.tsx` (전면 재작성)
- `apps/admin/src/styles.css` — `.dashboard-compact`, `.call-card`, `.call-kanban-column` 스코프 CSS 추가 (기존 파일 유지, 별도 CSS 파일 신설 안 함)

### 삭제
- `apps/admin/src/features/dashboard/components/ActiveCallsTable.tsx` (ActiveCallsKanban 으로 대체)

### 변경 없음
- `CallDetailDrawer.tsx`
- `useDashboardData.ts`
- 백엔드 / API / 스키마
- `InfraStatusBar`, `BranchFilterSelect`

## 검증 체크리스트 (수동)

Mock 모드 + Real 모드 각각 확인.

1. **대시보드 1080p 에 스크롤 없이 들어가는가** (1920×1080, 크롬 zoom 100%)
2. KPI / Queue / 팀 / 경보 / 추이 각 블록의 숫자·라벨 가독성 있는가 (9~11px 폰트 기준 글자 끊김 없는지)
3. 활성콜 미니 칸반과 라이브콜 풀 칸반 — 상태 전이 시 카드가 올바른 칼럼으로 이동하는가 (Mock 소켓 이벤트로 시뮬레이션)
4. 경과시간이 매초 증가하는가 (폴링과 독립)
5. 칸반 카드 클릭 → `CallDetailDrawer` 기존 동작 유지
6. 지점 필터 변경 시 두 페이지 모두 반영
7. 권한 `canOperate = false` 인 계정으로 로그인 시 quick-action 미노출
8. 한 칼럼에 카드 20+ 발생 시 해당 칼럼만 내부 스크롤
9. `TRANSFERRING` 상태 시 전환 뱃지 (phase) 표시
10. 기존 두 페이지의 라우팅/메뉴/권한 접근 회귀 없음

## 열린 질문

- 현재 `useDashboardData` 응답의 `activeCalls[].status` 가 라이브콜의 `sessionStatus` 와 enum 값이 일치하는지 — 구현 시 교차 확인 필요 (`TALKING` vs `TALKING`, `HOLD` 존재 여부 등)
- 1080p 에서 전체가 스크롤 없이 안 들어갈 경우: 하단 3열 (Queue/팀/추이) 높이를 더 줄일지, 활성콜 칸반 높이를 양보할지 — 구현 중 실측 기반 조정
