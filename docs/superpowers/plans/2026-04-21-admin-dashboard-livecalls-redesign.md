# 어드민 대시보드 & 실시간 통화현황 리디자인 구현 계획

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/admin` 의 `/dashboard` 와 `/live-calls` 두 페이지를 정보 밀도 + 한눈 파악성 중심으로 재설계. 대시보드는 1920×1080 스크롤 없는 단일 뷰(옵션 C), 라이브콜은 상태별 칸반(Kanban) 형태.

**Architecture:**
1. 공통 유틸(`callStatusMap`, `useNow`) + 공통 UI(`CallCard`, `CallKanbanColumn`) 를 `shared/` 에 선행 구축.
2. 라이브콜 페이지를 테이블 → 칸반으로 전면 재작성 (기존 `CallDetailDrawer` 재사용).
3. 대시보드의 `ActiveCallsTable` → `ActiveCallsKanban` (대시보드 미니판). 기타 블록은 `compact` prop 으로 조밀화 + CSS Grid 로 재배치.
4. 백엔드 / API / 스키마 / 권한 로직 **변경 없음**.

**Tech Stack:** React 18 + TypeScript + Vite 5 + Ant Design 5 + axios + react-router-dom

**Spec:** `docs/superpowers/specs/2026-04-21-admin-dashboard-livecalls-redesign.md`

**검증 방법:** `apps/admin` 에는 테스트 프레임워크가 없음. 각 태스크는 (1) `npm run build` 로 타입체크 통과, (2) `npm run dev -- --port 5174` 로 브라우저(Mock 모드, `VITE_USE_MOCK=true`) 시각 확인, (3) 스펙의 검증 체크리스트 해당 항목 확인, (4) 커밋 순으로 진행.

---

## Chunk 1: 공통 유틸 + 공통 UI (Foundation)

모든 후속 작업이 이 청크의 산출물을 import 한다. 순서대로 작업하되 UI 컴포넌트는 각자 독립 파일.

### Task 1: `shared/lib/callStatusMap.ts` — 상태 매핑 단일 소스

**Files:**
- Create: `apps/admin/src/shared/lib/callStatusMap.ts`

- [ ] **Step 1: 파일 생성**

```ts
export type KanbanColumn = 'queued' | 'ringing' | 'talking' | 'acw';

const STATUS_TO_COLUMN: Record<string, KanbanColumn> = {
  NEW: 'queued',
  QUEUED: 'queued',
  RINGING_AGENT: 'ringing',
  TALKING: 'talking',
  HOLD: 'talking',
  TRANSFERRING: 'talking',
  AFTER_CALL_WORK: 'acw',
};

export function toKanbanColumn(status: string | null | undefined): KanbanColumn {
  if (!status) return 'queued';
  return STATUS_TO_COLUMN[status] ?? 'queued';
}

export interface KanbanColumnMeta {
  id: KanbanColumn;
  label: string;
  accentVar: string;
  emptyText: string;
}

export const KANBAN_COLUMNS: readonly KanbanColumnMeta[] = [
  { id: 'queued', label: '대기', accentVar: '#f59e0b', emptyText: '대기 중인 통화 없음' },
  { id: 'ringing', label: '벨 울림', accentVar: '#3b82f6', emptyText: '호출 중인 통화 없음' },
  { id: 'talking', label: '통화 중', accentVar: '#10b981', emptyText: '통화 중 없음' },
  { id: 'acw', label: '후처리', accentVar: '#8b5cf6', emptyText: '후처리 없음' },
];

export function groupByKanbanColumn<T extends { status?: string | null; sessionStatus?: string | null }>(
  items: readonly T[],
): Record<KanbanColumn, T[]> {
  const result: Record<KanbanColumn, T[]> = { queued: [], ringing: [], talking: [], acw: [] };
  for (const item of items) {
    const col = toKanbanColumn(item.sessionStatus ?? item.status);
    result[col].push(item);
  }
  return result;
}
```

- [ ] **Step 2: 타입 체크**

```bash
cd apps/admin && npx tsc --noEmit
```

Expected: 새 파일 관련 에러 0건.

- [ ] **Step 3: 커밋**

```bash
git add apps/admin/src/shared/lib/callStatusMap.ts
git commit -m "feat(admin): add callStatusMap utility (shared kanban column mapping)"
```

---

### Task 2: `shared/hooks/useNow.ts` — 매초 tick + 탭 visibility 일시정지

**Files:**
- Create: `apps/admin/src/shared/hooks/useNow.ts`

- [ ] **Step 1: 파일 생성**

```ts
import { useEffect, useState } from 'react';

export function useNow(intervalMs: number = 1000): number {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    let timer: number | null = null;

    const start = () => {
      if (timer !== null) return;
      timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    };
    const stop = () => {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
      } else {
        setNow(Date.now());
        start();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [intervalMs]);

  return now;
}

export function secondsSince(isoString: string | null | undefined, now: number): number {
  if (!isoString) return 0;
  const t = Date.parse(isoString);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 1000));
}

export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${r}s`;
}
```

- [ ] **Step 2: 타입 체크**

```bash
cd apps/admin && npx tsc --noEmit
```

Expected: 에러 0건.

- [ ] **Step 3: 커밋**

```bash
git add apps/admin/src/shared/hooks/useNow.ts
git commit -m "feat(admin): add useNow hook with visibility-pause + elapsed helpers"
```

---

### Task 3: `shared/components/CallCard.tsx` — 공통 통화 카드 (mini / full)

**Files:**
- Create: `apps/admin/src/shared/components/CallCard.tsx`

`CallRow` 타입은 `apps/admin/src/features/live-calls/CallDetailDrawer.tsx:6-25` 의 기존 인터페이스를 공유 사용. 일단 import 경로만 참조.

- [ ] **Step 1: 파일 생성**

```tsx
import { Tag, Tooltip, Typography } from 'antd';
import type { CSSProperties, MouseEvent } from 'react';
import type { CallRow } from '../../features/live-calls/CallDetailDrawer';
import { toKanbanColumn, KANBAN_COLUMNS } from '../lib/callStatusMap';
import { formatElapsed, secondsSince } from '../hooks/useNow';

const TRANSFER_PHASE_LABEL: Record<string, string> = {
  REQUESTED: '요청됨',
  CONSULT_RINGING: '협의 호출',
  CONSULT_TALKING: '협의 통화',
  REBRIDGING: '재연결 중',
  COMPLETED: '완료',
  FAILED: '실패',
  EXPIRED: '만료',
};

const TRANSFER_PHASE_COLOR: Record<string, string> = {
  REQUESTED: 'default',
  CONSULT_RINGING: 'gold',
  CONSULT_TALKING: 'blue',
  REBRIDGING: 'cyan',
  COMPLETED: 'green',
  FAILED: 'red',
  EXPIRED: 'orange',
};

function borderColorForElapsed(seconds: number): string {
  if (seconds <= 30) return '#10b981';
  if (seconds <= 60) return '#f59e0b';
  return '#f5222d';
}

function elapsedForCard(call: CallRow, now: number): number {
  const col = toKanbanColumn(call.sessionStatus);
  if (col === 'talking' && call.answeredAt) return secondsSince(call.answeredAt, now);
  if (col === 'queued' && call.queuedAt) return secondsSince(call.queuedAt, now);
  if (col === 'ringing' && call.queuedAt) return secondsSince(call.queuedAt, now);
  return call.talkSeconds ?? call.waitSeconds ?? 0;
}

export interface CallCardProps {
  call: CallRow;
  now: number;
  variant?: 'mini' | 'full';
  onClick?: (call: CallRow) => void;
}

export function CallCard({ call, now, variant = 'full', onClick }: CallCardProps) {
  const col = toKanbanColumn(call.sessionStatus);
  const colMeta = KANBAN_COLUMNS.find((c) => c.id === col)!;
  const elapsed = elapsedForCard(call, now);
  const borderColor = col === 'acw' ? colMeta.accentVar : borderColorForElapsed(elapsed);
  const transferPhase = call.latestTransfer?.phase;

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    onClick?.(call);
  };

  const style: CSSProperties = {
    borderLeft: `3px solid ${borderColor}`,
  };

  if (variant === 'mini') {
    return (
      <div className="call-card call-card--mini" style={style} onClick={handleClick}>
        <div className="call-card__row">
          <Typography.Text strong className="call-card__ani">{call.ani}</Typography.Text>
          <Typography.Text className="call-card__elapsed">{formatElapsed(elapsed)}</Typography.Text>
        </div>
        <Typography.Text type="secondary" className="call-card__sub">
          {call.agentName || call.primaryAgentId || call.queueName || '-'}
        </Typography.Text>
        {transferPhase ? (
          <Tag color={TRANSFER_PHASE_COLOR[transferPhase] ?? 'default'} style={{ marginTop: 4 }}>
            {TRANSFER_PHASE_LABEL[transferPhase] ?? transferPhase}
          </Tag>
        ) : null}
      </div>
    );
  }

  return (
    <div className="call-card call-card--full" style={style} onClick={handleClick}>
      <div className="call-card__row">
        <Tooltip title={`Linked ${call.linkedid}`}>
          <Typography.Text strong className="call-card__ani">{call.ani}</Typography.Text>
        </Tooltip>
        <Typography.Text className="call-card__elapsed">{formatElapsed(elapsed)}</Typography.Text>
      </div>
      <div className="call-card__meta">
        <Typography.Text type="secondary">
          {call.queueName ?? '-'}
        </Typography.Text>
        <Typography.Text type="secondary">
          {call.agentName || call.primaryAgentId || '미배정'}
        </Typography.Text>
      </div>
      {call.representativeNumber || call.didNumber || call.dnis ? (
        <Typography.Text type="secondary" className="call-card__did">
          {call.representativeNumber ?? call.didNumber ?? call.dnis}
        </Typography.Text>
      ) : null}
      {transferPhase ? (
        <Tag color={TRANSFER_PHASE_COLOR[transferPhase] ?? 'default'} style={{ marginTop: 4 }}>
          {TRANSFER_PHASE_LABEL[transferPhase] ?? transferPhase}
          {call.latestTransfer?.toExtension ? ` · ${call.latestTransfer.toExtension}` : ''}
        </Tag>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
cd apps/admin && npx tsc --noEmit
```

Expected: 에러 0건 (`CallRow` 는 기존 파일에서 가져오므로 타입 충돌 없음).

- [ ] **Step 3: 커밋**

```bash
git add apps/admin/src/shared/components/CallCard.tsx
git commit -m "feat(admin): add CallCard component (mini/full variants + transfer badge)"
```

---

### Task 4: `shared/components/CallKanbanColumn.tsx` — 칼럼 (헤더 + 카드 리스트)

**Files:**
- Create: `apps/admin/src/shared/components/CallKanbanColumn.tsx`

- [ ] **Step 1: 파일 생성**

```tsx
import { Typography } from 'antd';
import type { KanbanColumn, KanbanColumnMeta } from '../lib/callStatusMap';
import type { CallRow } from '../../features/live-calls/CallDetailDrawer';
import { CallCard } from './CallCard';

export interface CallKanbanColumnProps {
  column: KanbanColumnMeta;
  items: readonly CallRow[];
  now: number;
  variant?: 'mini' | 'full';
  onCardClick?: (call: CallRow) => void;
}

export function CallKanbanColumn({ column, items, now, variant = 'full', onCardClick }: CallKanbanColumnProps) {
  return (
    <div className={`call-kanban-column call-kanban-column--${variant}`}>
      <div className="call-kanban-column__header" style={{ borderTopColor: column.accentVar }}>
        <span className="call-kanban-column__label">{column.label}</span>
        <span className="call-kanban-column__count">{items.length}</span>
      </div>
      <div className="call-kanban-column__body">
        {items.length === 0 ? (
          <Typography.Text type="secondary" className="call-kanban-column__empty">
            {column.emptyText}
          </Typography.Text>
        ) : (
          items.map((call) => (
            <CallCard
              key={call.callId}
              call={call}
              now={now}
              variant={variant}
              onClick={onCardClick}
            />
          ))
        )}
      </div>
    </div>
  );
}

export type { KanbanColumn };
```

- [ ] **Step 2: 타입 체크**

```bash
cd apps/admin && npx tsc --noEmit
```

Expected: 에러 0건.

- [ ] **Step 3: 커밋**

```bash
git add apps/admin/src/shared/components/CallKanbanColumn.tsx
git commit -m "feat(admin): add CallKanbanColumn component (column header + card list)"
```

---

### Task 5: `styles.css` — 칸반 / 카드 / 조밀 대시보드 스타일 추가

**Files:**
- Modify: `apps/admin/src/styles.css`

- [ ] **Step 1: 파일 하단에 아래 CSS 추가** (기존 내용 변경 금지)

```css
/* ============= Call Card ============= */
.call-card {
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
  padding: 8px 10px;
  cursor: pointer;
  transition: box-shadow 120ms;
}
.call-card:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}
.call-card__row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.call-card__ani {
  font-size: 13px;
  letter-spacing: 0.2px;
}
.call-card__elapsed {
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: #595959;
}
.call-card__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11.5px;
  margin-top: 2px;
}
.call-card__did, .call-card__sub {
  display: block;
  font-size: 11px;
  margin-top: 2px;
}
.call-card--mini {
  padding: 6px 8px;
}
.call-card--mini .call-card__ani { font-size: 12px; }
.call-card--mini .call-card__elapsed { font-size: 11px; }

/* ============= Kanban Column ============= */
.call-kanban-column {
  display: flex;
  flex-direction: column;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  min-height: 240px;
  overflow: hidden;
}
.call-kanban-column--mini { min-height: 120px; }
.call-kanban-column__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  border-top: 3px solid #d9d9d9;
  background: #fff;
  font-weight: 600;
  font-size: 12px;
}
.call-kanban-column__label { color: #262626; }
.call-kanban-column__count {
  background: #f0f0f0;
  border-radius: 10px;
  padding: 0 8px;
  font-size: 11px;
  color: #595959;
}
.call-kanban-column__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.call-kanban-column__empty {
  display: block;
  text-align: center;
  padding: 16px 0;
  color: #bfbfbf;
  font-size: 11px;
}

/* ============= Dashboard Compact Grid ============= */
.dashboard-compact {
  display: grid;
  grid-template-columns: 3fr 1fr;
  grid-template-rows: auto auto 1fr auto;
  grid-template-areas:
    "header header"
    "kpi    alerts"
    "calls  calls"
    "bottom bottom";
  gap: 10px;
  height: calc(100vh - 120px);
  min-height: 720px;
}
.dashboard-compact__header { grid-area: header; }
.dashboard-compact__kpi    { grid-area: kpi; }
.dashboard-compact__alerts { grid-area: alerts; }
.dashboard-compact__calls  { grid-area: calls; min-height: 0; }
.dashboard-compact__bottom {
  grid-area: bottom;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
}
.dashboard-compact .ant-card-head { min-height: 34px; padding: 0 12px; }
.dashboard-compact .ant-card-head-title { font-size: 13px; padding: 6px 0; }
.dashboard-compact .ant-card-body { padding: 10px 12px; }
.dashboard-compact .ant-table-small .ant-table-thead > tr > th,
.dashboard-compact .ant-table-small .ant-table-tbody > tr > td {
  padding: 4px 8px;
  font-size: 11.5px;
}
.dashboard-compact__kpi-strip {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}
.dashboard-compact__kpi-cell {
  background: #fff;
  border: 1px solid #f0f0f0;
  border-left: 3px solid #1677ff;
  border-radius: 4px;
  padding: 6px 10px;
}
.dashboard-compact__kpi-cell .label { font-size: 11px; color: #8c8c8c; }
.dashboard-compact__kpi-cell .value { font-size: 18px; font-weight: 700; color: #141414; }
.dashboard-compact__kpi-cell .delta { font-size: 11px; color: #52c41a; }

/* ============= Active Calls Kanban (dashboard) ============= */
.active-calls-kanban {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 8px;
  height: 100%;
  min-height: 0;
}

/* ============= Live Calls Page ============= */
.live-calls-page__summary {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 8px 14px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
  margin-bottom: 12px;
  font-size: 12px;
}
.live-calls-page__summary-item {
  display: flex;
  gap: 6px;
  align-items: baseline;
}
.live-calls-page__summary-item .value {
  font-weight: 700;
  font-size: 15px;
}
.live-calls-page__kanban {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 10px;
  min-height: calc(100vh - 240px);
}
```

- [ ] **Step 2: 타입/빌드 체크**

```bash
cd apps/admin && npm run build
```

Expected: 빌드 성공. CSS 는 번들되지만 아직 어떤 컴포넌트도 사용 안 하므로 시각 변화 없음.

- [ ] **Step 3: 커밋**

```bash
git add apps/admin/src/styles.css
git commit -m "style(admin): add CSS for call card, kanban column, compact dashboard grid"
```

---

## Chunk 2: 라이브콜 페이지 칸반 전환

`Foundation` 청크 산출물을 쓰는 첫 실사용자 화면. 기존 `CallDetailDrawer` 은 건드리지 않음.

### Task 6: `LiveCallsPage.tsx` — Table → Kanban 전환

**Files:**
- Modify: `apps/admin/src/features/live-calls/LiveCallsPage.tsx` (전면 재작성)

- [ ] **Step 1: 파일 전체 교체**

```tsx
import { Badge, Card, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { BranchFilterSelect } from '../../shared/branches/BranchFilterSelect';
import { CallKanbanColumn } from '../../shared/components/CallKanbanColumn';
import { KANBAN_COLUMNS, groupByKanbanColumn } from '../../shared/lib/callStatusMap';
import { useNow } from '../../shared/hooks/useNow';
import { CallDetailDrawer, type CallRow } from './CallDetailDrawer';

export function LiveCallsPage() {
  const [rows, setRows] = useState<CallRow[]>([]);
  const [selected, setSelected] = useState<CallRow | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const now = useNow(1000);

  const load = async () => {
    try {
      const res = await apiClient.get('/calls/active', {
        params: branchId ? { branchId } : undefined,
      });
      setRows(res.data?.data ?? []);
      setLastUpdated(new Date());
    } catch {
      // keep previous data on error
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [branchId]);

  const grouped = useMemo(() => groupByKanbanColumn(rows), [rows]);

  return (
    <Card bodyStyle={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>통화 현황 조회</Typography.Title>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <BranchFilterSelect value={branchId} onChange={setBranchId} />
          <Typography.Text type="secondary">
            {lastUpdated ? `${lastUpdated.toLocaleTimeString()} 기준` : '로딩 중...'}&nbsp;
            <Badge status="processing" text="3초 갱신" />
          </Typography.Text>
        </div>
      </div>

      <div className="live-calls-page__summary">
        <div className="live-calls-page__summary-item">
          <span>활성</span><span className="value">{rows.length}</span>
        </div>
        {KANBAN_COLUMNS.map((col) => (
          <div key={col.id} className="live-calls-page__summary-item">
            <span>{col.label}</span>
            <span className="value" style={{ color: col.accentVar }}>{grouped[col.id].length}</span>
          </div>
        ))}
      </div>

      <div className="live-calls-page__kanban">
        {KANBAN_COLUMNS.map((col) => (
          <CallKanbanColumn
            key={col.id}
            column={col}
            items={grouped[col.id]}
            now={now}
            variant="full"
            onCardClick={setSelected}
          />
        ))}
      </div>

      <CallDetailDrawer
        call={selected}
        onClose={() => setSelected(null)}
        onHangup={() => void load()}
      />
    </Card>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd apps/admin && npm run build
```

Expected: 빌드 성공. 타입 에러 0건.

- [ ] **Step 3: 시각 확인 (Mock 모드)**

```bash
cd apps/admin && npm run dev -- --port 5174
```

브라우저 `http://localhost:5174/live-calls` 접속 후 확인:
- 상단: 타이틀 + 지점 필터 + "3초 갱신" 뱃지
- 요약 스트립: 활성 N / 대기 / 벨 울림 / 통화 중 / 후처리 건수
- 4칼럼 칸반 — Mock 활성콜이 상태별로 분산 표시
- 각 카드 좌측 borderLeft 색상이 경과시간에 따라 변함 (30s↓ 초록 / 60s↓ 황 / 60s↑ 적)
- 카드 클릭 시 기존 `CallDetailDrawer` 가 우측에서 열림
- 경과시간이 매초 증가

- [ ] **Step 4: 커밋**

```bash
git add apps/admin/src/features/live-calls/LiveCallsPage.tsx
git commit -m "feat(admin): rewrite LiveCallsPage as 4-column status kanban

- Summary strip (active/queued/ringing/talking/acw counts)
- Cards grouped by sessionStatus via shared callStatusMap util
- Branch filter (new on this page)
- useNow tick for per-second elapsed updates
- CallDetailDrawer unchanged (reused as-is)"
```

---

## Chunk 3: 대시보드 재레이아웃

### Task 7: `features/dashboard/components/ActiveCallsKanban.tsx` — 대시보드 미니판

**Files:**
- Create: `apps/admin/src/features/dashboard/components/ActiveCallsKanban.tsx`

`ActiveCallItem` (대시보드 타입) 을 `CallRow` (라이브콜 타입) 로 어댑트.

**핵심 디자인 결정:** `ActiveCallItem` 은 `queuedAt`/`answeredAt` 타임스탬프 필드가 없어서 정적 `waitingSec`/`talkingSec` 만 넘기면 미니 카드의 경과시간이 매초 틱하지 않음 (5초 폴링 시점에만 갱신). 스펙의 "폴링과 독립적으로 매초" 원칙을 지키기 위해, 콜 id 를 처음 본 시각(`Date.now() - waitingSec*1000`) 을 `useRef` 에 캐시해 재사용한다. 이미 본 id 는 캐시된 값을 유지하고, 사라진 id 는 다음 poll 에 제거.

- [ ] **Step 1: 파일 생성**

```tsx
import { Card, Typography } from 'antd';
import { useEffect, useMemo, useRef } from 'react';
import type { ActiveCallItem } from '../types/dashboard';
import type { CallRow } from '../../live-calls/CallDetailDrawer';
import { CallKanbanColumn } from '../../../shared/components/CallKanbanColumn';
import { KANBAN_COLUMNS, groupByKanbanColumn, toKanbanColumn } from '../../../shared/lib/callStatusMap';
import { useNow } from '../../../shared/hooks/useNow';

interface StampCache {
  queuedAt?: string;
  answeredAt?: string;
}

function makeAdapter() {
  const cache = new Map<string, StampCache>();

  const adapt = (item: ActiveCallItem): CallRow => {
    const existing = cache.get(item.id) ?? {};
    const column = toKanbanColumn(item.status);
    const nowMs = Date.now();

    if (!existing.queuedAt && (column === 'queued' || column === 'ringing' || column === 'talking' || column === 'acw')) {
      const queuedMs = nowMs - Math.max(0, item.waitingSec) * 1000;
      existing.queuedAt = new Date(queuedMs).toISOString();
    }
    if (!existing.answeredAt && column === 'talking') {
      const answeredMs = nowMs - Math.max(0, item.talkingSec) * 1000;
      existing.answeredAt = new Date(answeredMs).toISOString();
    }
    cache.set(item.id, existing);

    return {
      callId: item.id,
      linkedid: item.id,
      ani: item.customerPhone,
      queueName: item.queueName,
      agentName: item.agentName,
      sessionStatus: item.status,
      queuedAt: existing.queuedAt,
      answeredAt: existing.answeredAt,
      talkSeconds: item.talkingSec,
      waitSeconds: item.waitingSec,
    };
  };

  const prune = (liveIds: Set<string>) => {
    for (const id of cache.keys()) {
      if (!liveIds.has(id)) cache.delete(id);
    }
  };

  return { adapt, prune };
}

export function ActiveCallsKanban({ items }: { items: ActiveCallItem[] }) {
  const now = useNow(1000);
  const adapterRef = useRef<ReturnType<typeof makeAdapter> | null>(null);
  if (adapterRef.current === null) adapterRef.current = makeAdapter();

  const rows = useMemo(() => items.map((i) => adapterRef.current!.adapt(i)), [items]);

  useEffect(() => {
    adapterRef.current!.prune(new Set(items.map((i) => i.id)));
  }, [items]);

  const grouped = useMemo(() => groupByKanbanColumn(rows), [rows]);

  return (
    <Card
      size="small"
      title={
        <span>
          🔴 실시간 활성 콜{' '}
          <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 11 }}>
            (총 {items.length}건)
          </Typography.Text>
        </span>
      }
      bodyStyle={{ padding: 10, height: 'calc(100% - 40px)' }}
      style={{ height: '100%' }}
    >
      <div className="active-calls-kanban">
        {KANBAN_COLUMNS.map((col) => (
          <CallKanbanColumn
            key={col.id}
            column={col}
            items={grouped[col.id] ?? []}
            now={now}
            variant="mini"
          />
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
cd apps/admin && npx tsc --noEmit
```

Expected: 에러 0건.

- [ ] **Step 3: 커밋**

```bash
git add apps/admin/src/features/dashboard/components/ActiveCallsKanban.tsx
git commit -m "feat(admin): add ActiveCallsKanban for dashboard (mini variant of live-calls kanban)"
```

---

### Task 8: `KpiCards.tsx` — 6칸 조밀 스트립 모드

**Files:**
- Modify: `apps/admin/src/features/dashboard/components/KpiCards.tsx`

- [ ] **Step 1: 파일 전체 교체**

```tsx
import { Card, Col, Row, Statistic, Tag } from 'antd';
import type { KpiItem } from '../types/dashboard';

export function KpiCards({ items, compact = false }: { items: KpiItem[]; compact?: boolean }) {
  if (compact) {
    return (
      <div className="dashboard-compact__kpi-strip">
        {items.map((item) => (
          <div key={item.key} className="dashboard-compact__kpi-cell">
            <div className="label">{item.label}</div>
            <div className="value">{item.value}</div>
            <div
              className="delta"
              style={{
                color:
                  item.trend === 'up' ? '#1677ff' :
                  item.trend === 'down' ? '#52c41a' : '#8c8c8c',
              }}
            >
              {item.delta}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Row gutter={[16, 16]}>
      {items.map((item) => (
        <Col xs={24} sm={12} xl={8} xxl={4} key={item.key}>
          <Card>
            <Statistic title={item.label} value={item.value} />
            <Tag color={item.trend === 'up' ? 'blue' : item.trend === 'down' ? 'green' : 'default'} style={{ marginTop: 12 }}>
              {item.delta}
            </Tag>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
cd apps/admin && npx tsc --noEmit
```

Expected: 에러 0건.

- [ ] **Step 3: 커밋**

```bash
git add apps/admin/src/features/dashboard/components/KpiCards.tsx
git commit -m "feat(admin): add compact mode to KpiCards (6-column dense strip)"
```

---

### Task 9: `QueueSummaryTable.tsx` / `TeamStatusTable.tsx` — compact prop

**Files:**
- Modify: `apps/admin/src/features/dashboard/components/QueueSummaryTable.tsx`
- Modify: `apps/admin/src/features/dashboard/components/TeamStatusTable.tsx`

- [ ] **Step 1: `QueueSummaryTable.tsx` 수정 — `compact` prop 추가**

```tsx
import { Card, Progress, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { QueueSummaryItem } from '../types/dashboard';
import { formatSecondsToClock } from '../../../shared/lib/format';

export function QueueSummaryTable({ items, compact = false }: { items: QueueSummaryItem[]; compact?: boolean }) {
  const columns: ColumnsType<QueueSummaryItem> = [
    { title: '큐', dataIndex: 'queueName' },
    { title: '대기', dataIndex: 'waiting', width: 50 },
    { title: '통화', dataIndex: 'talking', width: 50 },
    ...(compact ? [] : [{ title: '가용 상담원', dataIndex: 'availableAgents' } as ColumnsType<QueueSummaryItem>[number]]),
    {
      title: '최장',
      dataIndex: 'longestWaitSec',
      width: 70,
      render: (value: number) => formatSecondsToClock(value),
    },
    {
      title: 'SLA',
      dataIndex: 'answerRate',
      render: (value: number) =>
        compact ? (
          <span style={{ fontVariantNumeric: 'tabular-nums', color: value < 80 ? '#faad14' : '#52c41a' }}>{value}%</span>
        ) : (
          <Progress percent={value} size="small" />
        ),
    },
    {
      title: '초과',
      dataIndex: 'slaBreached',
      width: 60,
      render: (value: number) => <Tag color={value > 0 ? 'error' : 'success'}>{value}</Tag>,
    },
  ];

  return (
    <Card
      title="Queue 요약"
      size={compact ? 'small' : 'default'}
      bodyStyle={compact ? { padding: 8 } : undefined}
      style={{ height: '100%' }}
    >
      <Table size="small" rowKey="queueName" pagination={false} dataSource={items} columns={columns} />
    </Card>
  );
}
```

- [ ] **Step 2: `TeamStatusTable.tsx` 수정 — `compact` prop 추가**

```tsx
import { Card, Table } from 'antd';
import type { AgentTeamSummaryItem } from '../types/dashboard';

export function TeamStatusTable({ items, compact = false }: { items: AgentTeamSummaryItem[]; compact?: boolean }) {
  return (
    <Card
      title="팀별 상담원 현황"
      size={compact ? 'small' : 'default'}
      bodyStyle={compact ? { padding: 8 } : undefined}
      style={{ height: '100%' }}
    >
      <Table
        size="small"
        rowKey="teamName"
        pagination={false}
        dataSource={items}
        columns={[
          { title: '팀', dataIndex: 'teamName' },
          { title: '가용', dataIndex: 'available' },
          { title: '호출', dataIndex: 'ringing' },
          { title: '통화', dataIndex: 'talking' },
          { title: '후처리', dataIndex: 'acw' },
          { title: '휴식', dataIndex: 'break' },
        ]}
      />
    </Card>
  );
}
```

- [ ] **Step 3: 타입 체크**

```bash
cd apps/admin && npx tsc --noEmit
```

Expected: 에러 0건.

- [ ] **Step 4: 커밋**

```bash
git add apps/admin/src/features/dashboard/components/QueueSummaryTable.tsx apps/admin/src/features/dashboard/components/TeamStatusTable.tsx
git commit -m "feat(admin): add compact prop to QueueSummaryTable and TeamStatusTable"
```

---

### Task 10: `AlertsPanel.tsx` — 조밀 리스트 모드

**Files:**
- Modify: `apps/admin/src/features/dashboard/components/AlertsPanel.tsx`

- [ ] **Step 1: 파일 전체 교체**

```tsx
import { Alert, Card, Space, Tag, Typography } from 'antd';
import type { AlertItem } from '../types/dashboard';

const LEVEL_COLOR: Record<AlertItem['level'], string> = {
  info: 'blue',
  warning: 'gold',
  error: 'red',
};

const LEVEL_SHORT: Record<AlertItem['level'], string> = {
  info: 'INFO',
  warning: 'WARN',
  error: 'CRIT',
};

export function AlertsPanel({ items, compact = false }: { items: AlertItem[]; compact?: boolean }) {
  if (compact) {
    return (
      <Card
        title={`⚠ 경보 (${items.length})`}
        size="small"
        bodyStyle={{ padding: 8, overflowY: 'auto', maxHeight: 200 }}
        style={{ height: '100%' }}
      >
        {items.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>활성 경보 없음</Typography.Text>
        ) : (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 11.5, lineHeight: 1.3 }}
              >
                <Tag color={LEVEL_COLOR[item.level]} style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                  {LEVEL_SHORT[item.level]}
                </Tag>
                <span style={{ flex: 1 }}>{item.message}</span>
                <Typography.Text type="secondary" style={{ fontSize: 10 }}>{item.time}</Typography.Text>
              </div>
            ))}
          </Space>
        )}
      </Card>
    );
  }

  return (
    <Card title="시스템 경보">
      <Space direction="vertical" style={{ width: '100%' }}>
        {items.map((item) => (
          <Alert
            key={item.id}
            type={item.level === 'error' ? 'error' : item.level === 'warning' ? 'warning' : 'info'}
            message={item.message}
            description={<Typography.Text type="secondary">{item.time}</Typography.Text>}
            showIcon
          />
        ))}
      </Space>
    </Card>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
cd apps/admin && npx tsc --noEmit
```

Expected: 에러 0건.

- [ ] **Step 3: 커밋**

```bash
git add apps/admin/src/features/dashboard/components/AlertsPanel.tsx
git commit -m "feat(admin): add compact list mode to AlertsPanel (dashboard sidebar)"
```

---

### Task 11: `TrafficChartCard.tsx` — compact (스파크바) 모드

**Files:**
- Modify: `apps/admin/src/features/dashboard/components/TrafficChartCard.tsx`

- [ ] **Step 1: 파일 전체 교체**

```tsx
import { Card, Space, Typography } from 'antd';
import type { HourlyTrafficItem } from '../types/dashboard';

function maxValue(items: HourlyTrafficItem[]) {
  return Math.max(1, ...items.flatMap((item) => [item.inbound, item.answered, item.abandoned]));
}

export function TrafficChartCard({ items, compact = false }: { items: HourlyTrafficItem[]; compact?: boolean }) {
  const max = maxValue(items);

  if (compact) {
    return (
      <Card
        title="시간대별 유입"
        size="small"
        bodyStyle={{ padding: 8 }}
        style={{ height: '100%' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
          {items.map((item) => (
            <div
              key={item.hour}
              title={`${item.hour} · in ${item.inbound} / ans ${item.answered} / abd ${item.abandoned}`}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column-reverse',
                gap: 1,
                minWidth: 4,
              }}
            >
              <div style={{ height: `${(item.answered / max) * 70}px`, background: '#1677ff', borderRadius: '1px 1px 0 0' }} />
              <div style={{ height: `${(item.abandoned / max) * 70}px`, background: '#ff4d4f' }} />
            </div>
          ))}
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 10, marginTop: 4, display: 'block' }}>
          응답 / 포기 (시간당)
        </Typography.Text>
      </Card>
    );
  }

  return (
    <Card title="시간대별 유입량" extra={<Typography.Text type="secondary">inbound / answered / abandoned</Typography.Text>}>
      <div className="traffic-chart">
        {items.map((item) => (
          <div className="traffic-row" key={item.hour}>
            <div className="traffic-hour">{item.hour}</div>
            <div className="traffic-bars">
              <div className="traffic-bar inbound" style={{ width: `${(item.inbound / max) * 100}%` }} />
              <div className="traffic-bar answered" style={{ width: `${(item.answered / max) * 100}%` }} />
              <div className="traffic-bar abandoned" style={{ width: `${(item.abandoned / max) * 100}%` }} />
            </div>
            <Space size="small">
              <Typography.Text>{item.inbound}</Typography.Text>
              <Typography.Text type="secondary">/ {item.answered}</Typography.Text>
              <Typography.Text type="danger">/ {item.abandoned}</Typography.Text>
            </Space>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
cd apps/admin && npx tsc --noEmit
```

Expected: 에러 0건.

- [ ] **Step 3: 커밋**

```bash
git add apps/admin/src/features/dashboard/components/TrafficChartCard.tsx
git commit -m "feat(admin): add compact sparkline mode to TrafficChartCard"
```

---

### Task 12: `AdminDashboardPage.tsx` — CSS Grid 단일 뷰 재배치

**Files:**
- Modify: `apps/admin/src/features/dashboard/components/AdminDashboardPage.tsx` (전면 재작성)

- [ ] **Step 1: 파일 전체 교체**

```tsx
import { Card, Skeleton, Space, Spin, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useDashboardData } from '../hooks/useDashboardData';
import { KpiCards } from './KpiCards';
import { TrafficChartCard } from './TrafficChartCard';
import { QueueSummaryTable } from './QueueSummaryTable';
import { TeamStatusTable } from './TeamStatusTable';
import { ActiveCallsKanban } from './ActiveCallsKanban';
import { AlertsPanel } from './AlertsPanel';
import { InfraStatusBar } from '../../monitoring/components/InfraStatusBar';
import { BranchFilterSelect } from '../../../shared/branches/BranchFilterSelect';

export function AdminDashboardPage() {
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const { data, loading, refreshing, error } = useDashboardData(branchId);

  if (loading) {
    return <Skeleton active paragraph={{ rows: 18 }} />;
  }

  if (!data) {
    return (
      <Card>
        <Typography.Text type="secondary">
          {error ?? '대시보드 데이터를 불러올 수 없습니다. 백엔드 서버 연결을 확인하세요.'}
        </Typography.Text>
      </Card>
    );
  }

  return (
    <div className="dashboard-compact">
      <div className="dashboard-compact__header">
        <Card size="small" bodyStyle={{ padding: '6px 12px' }}>
          <Space align="center" size="middle" wrap>
            <Typography.Title level={5} style={{ margin: 0 }}>콜센터 운영 대시보드</Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              갱신 {dayjs(data.updatedAt).format('HH:mm:ss')}
            </Typography.Text>
            <BranchFilterSelect value={branchId} onChange={setBranchId} />
            {refreshing ? <Spin size="small" /> : null}
            {error ? <Typography.Text type="warning" style={{ fontSize: 11 }}>{error}</Typography.Text> : null}
            <InfraStatusBar />
          </Space>
        </Card>
      </div>

      <div className="dashboard-compact__kpi">
        <KpiCards items={data.kpis} compact />
      </div>

      <div className="dashboard-compact__alerts">
        <AlertsPanel items={data.alerts} compact />
      </div>

      <div className="dashboard-compact__calls">
        <ActiveCallsKanban items={data.activeCalls} />
      </div>

      <div className="dashboard-compact__bottom">
        <QueueSummaryTable items={data.queues} compact />
        <TeamStatusTable items={data.teams} compact />
        <TrafficChartCard items={data.traffic} compact />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd apps/admin && npm run build
```

Expected: 빌드 성공. 타입 에러 0건.

- [ ] **Step 3: 시각 확인 (Mock 모드)**

```bash
cd apps/admin && npm run dev -- --port 5174
```

브라우저 `http://localhost:5174/dashboard` (크롬 zoom 100%, 1920×1080) 접속 후 확인:
- 전체가 스크롤 없이 한 화면에 표시됨
- 상단 헤더: 타이틀 + 갱신시각 + 지점필터 + 인프라 상태바
- 우상단: 경보 리스트 (compact)
- 중앙: 활성콜 미니 칸반 4칼럼 (대기/벨/통화/후처리)
- 하단: Queue 요약 / 팀별 현황 / 시간대별 유입(스파크바) 3열
- KPI 6칸 스트립 — label/value/delta 한 줄로 가독성 유지
- 카드 패딩/폰트 축소되었으나 숫자·텍스트 끊김 없음

- [ ] **Step 4: 커밋**

```bash
git add apps/admin/src/features/dashboard/components/AdminDashboardPage.tsx
git commit -m "feat(admin): rewrite AdminDashboardPage as single-screen CSS Grid layout

Replaces Row/Col vertical stack with grid-template-areas:
- header row (title + branch filter + infra status)
- kpi (3fr) + alerts (1fr) row
- active calls kanban (full width)
- bottom 3-col row: queue + team + traffic sparkline

All sub-components use compact prop; ActiveCallsKanban replaces ActiveCallsTable.
No backend changes."
```

---

### Task 13: `ActiveCallsTable.tsx` 제거

**Files:**
- Delete: `apps/admin/src/features/dashboard/components/ActiveCallsTable.tsx`

- [ ] **Step 1: 다른 곳에서 import 하는지 확인**

```bash
cd apps/admin && grep -r "ActiveCallsTable" src/ || echo "no-imports"
```

Expected: `no-imports` 또는 삭제 대상 파일 자체만 매치.

- [ ] **Step 2: 파일 삭제**

```bash
rm apps/admin/src/features/dashboard/components/ActiveCallsTable.tsx
```

- [ ] **Step 3: 빌드 확인**

```bash
cd apps/admin && npm run build
```

Expected: 빌드 성공.

- [ ] **Step 4: 커밋**

```bash
git add -A apps/admin/src/features/dashboard/components/
git commit -m "chore(admin): remove ActiveCallsTable (replaced by ActiveCallsKanban)"
```

---

## Chunk 4: 통합 검증

### Task 14: 전체 시각 검증 + 회귀 체크

**Files:** (확인만, 변경 없음)

- [ ] **Step 1: Mock 모드 전체 플로우 검증**

```bash
cd apps/admin && npm run dev -- --port 5174
```

아래 체크리스트 전부 확인 (스펙 §검증 체크리스트 10개 항목):

1. `/dashboard` — 1920×1080 에서 세로 스크롤 없음
2. KPI 6칸 / Queue / 팀 / 경보 / 추이 각 블록 가독성 (폰트 끊김 없음)
3. `/live-calls` 와 `/dashboard` 모두 — 상태 전이 시 카드가 올바른 칼럼에 표시됨
4. 경과시간이 매초 증가함 (관찰)
5. 카드 클릭 → `CallDetailDrawer` 열림, 강제종료 버튼 동작 (canOperate 시)
6. 지점 필터 변경 시 `/dashboard` + `/live-calls` 둘 다 데이터 재조회
7. `canOperate=false` 계정 (agent 역할) — mock 에선 우회됨. Real 모드에서만 확인 가능 → 이 항목은 Real 검증으로 표시
8. 칸반 한 칼럼에 카드 20+ 발생 시 해당 칼럼만 내부 스크롤 (수동으로 mock 데이터 뻥튀기 필요 없음 — CSS 단순 확인)
9. `TRANSFERRING` 상태 / `latestTransfer.phase` 뱃지 표시 (mock 데이터에 있을 때)
10. 기존 `/agents`, `/queues` 등 다른 메뉴 정상 동작 (회귀 없음)

- [ ] **Step 2: 브라우저 콘솔 에러 확인**

개발자 도구 콘솔 0 에러 확인 (React warning 포함).

- [ ] **Step 3: Real 모드 빌드 검증**

```bash
cd apps/admin && npm run build
```

Expected: `dist/` 생성 성공, 번들 경고 외 에러 0건.

- [ ] **Step 4: 최종 커밋 (있다면)**

검증 중 발견된 사소한 수정이 있으면 별도 커밋:

```bash
git add <수정 파일>
git commit -m "fix(admin): <구체적 수정 내용>"
```

없다면 이 단계 스킵.

---

## 완료 조건

모든 청크 통과 시:
- 대시보드가 1920×1080 에서 스크롤 없이 6개 블록 + 활성콜 칸반을 한 화면에 표시
- 라이브콜 페이지가 4칼럼 칸반으로 동작, 카드 클릭 → 기존 drawer 재사용
- `CallCard`, `CallKanbanColumn`, `callStatusMap`, `useNow` 4개 공유 모듈이 두 페이지에서 재사용
- 백엔드 / API / 권한 로직 무변경
- 기존 `CallDetailDrawer`, `useDashboardData`, 라우팅, 권한 회귀 없음
- `npm run build` 성공
