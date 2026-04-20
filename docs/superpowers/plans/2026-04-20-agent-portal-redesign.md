# 상담원 포털 UI 리디자인 구현 계획

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/web` 상담원 포털을 다크 프로 + 에메랄드 액센트 디자인으로 전면 리디자인 (비즈니스 로직 무변경)

**Architecture:** 기존 CSS 변수(`--color-*`) 재지정으로 전역 팔레트를 교체하고, Full 모드는 56px 아이콘 사이드바 + 4열 고정 레이아웃으로 재구성, Mini 모드는 420px 카드를 섹션별 스타일로 교체한다.

**Tech Stack:** React 19 + TypeScript + Tailwind CSS + Ant Design 5 + Zustand + Vite

**Spec:** `docs/superpowers/specs/2026-04-20-agent-portal-redesign.md`

**검증 방법:** `apps/web`에는 테스트 프레임워크가 없음. 각 태스크는 (1) `npm run build` 로 타입체크 통과, (2) `npm run dev` 로 브라우저에서 시각 확인, (3) 승인 목업 `.superpowers/brainstorm/53772-1776690424/full-and-mini.html` 과 대조, (4) 커밋 순으로 진행한다.

---

## Chunk 1: CSS 토큰 교체 (Foundation)

모든 후속 작업의 기반. `[data-theme='dark']` 블록의 `--color-*` 토큰을 다크 프로 팔레트 RGB 트리플렛으로 교체하고, 새 별칭 변수와 키프레임을 추가한다.

### Task 1: `styles/index.css` CSS 변수 전면 교체

**Files:**
- Modify: `apps/web/src/styles/index.css` (특히 `[data-theme='dark']` 블록 65–116행)

- [ ] **Step 1: 기준 상태 확인 (dev 서버 기동)**

```bash
cd apps/web && npm run dev
```

브라우저에서 `http://localhost:5173?mode=full` 을 열어 **교체 전** 스크린샷을 캡처 (비교용). Mock 모드 유지.

- [ ] **Step 2: `[data-theme='dark']` 블록 교체**

`apps/web/src/styles/index.css` 65–116행 `[data-theme='dark']` 블록 전체를 아래로 교체. 스펙 Section 6의 매핑을 정확히 사용.

```css
[data-theme='dark'] {
  /* 배경 계층 */
  --color-background:                  13 17 23;
  --color-surface:                     13 17 23;
  --color-surface-container-lowest:    1 4 9;
  --color-surface-container-low:       17 23 32;
  --color-surface-container:           22 27 34;
  --color-surface-container-high:      33 38 45;
  --color-surface-container-highest:   48 54 61;
  --color-surface-variant:             22 27 34;
  --color-surface-dim:                 13 17 23;
  --color-surface-bright:              33 38 45;
  --color-surface-tint:                52 211 153;
  --color-inverse-surface:             230 237 243;
  --color-inverse-on-surface:          22 27 34;

  /* 텍스트 */
  --color-on-background:               230 237 243;
  --color-on-surface:                  230 237 243;
  --color-on-surface-variant:          139 148 158;
  --color-outline:                     72 79 88;
  --color-outline-variant:             33 38 45;

  /* Primary (에메랄드) */
  --color-primary:                     52 211 153;
  --color-on-primary:                  1 4 9;
  --color-primary-container:           8 40 25;
  --color-on-primary-container:        52 211 153;
  --color-primary-fixed:               52 211 153;
  --color-primary-fixed-dim:           5 150 105;
  --color-on-primary-fixed:            1 4 9;
  --color-on-primary-fixed-variant:    5 150 105;
  --color-inverse-primary:             5 150 105;

  /* Error (레드) */
  --color-error:                       248 81 73;
  --color-on-error:                    1 4 9;
  --color-error-container:             46 10 8;
  --color-on-error-container:          248 81 73;

  /* Tertiary (앰버) */
  --color-tertiary:                    210 153 34;
  --color-on-tertiary:                 1 4 9;
  --color-tertiary-container:          42 30 6;
  --color-on-tertiary-container:       210 153 34;
  --color-tertiary-fixed:              251 191 36;
  --color-tertiary-fixed-dim:          210 153 34;
  --color-on-tertiary-fixed:           1 4 9;
  --color-on-tertiary-fixed-variant:   42 30 6;

  /* Secondary (뉴트럴 그레이) */
  --color-secondary:                   139 148 158;
  --color-on-secondary:                1 4 9;
  --color-secondary-container:         22 27 34;
  --color-on-secondary-container:      230 237 243;
  --color-secondary-fixed:             33 38 45;
  --color-secondary-fixed-dim:         48 54 61;
  --color-on-secondary-fixed:          230 237 243;
  --color-on-secondary-fixed-variant:  139 148 158;

  --gradient-primary-from: #059669;
  --gradient-primary-to:   #34d399;

  /* 신규 별칭 (신규 컴포넌트 style={} 전용 — hex) */
  --bg-base:       #010409;
  --bg-surface:    #0d1117;
  --bg-elevated:   #161b22;
  --bg-raised:     #21262d;
  --border-subtle: #21262d;
  --border-dim:    #30363d;
  --text-primary:  #e6edf3;
  --text-secondary:#8b949e;
  --text-muted:    #484f58;
  --accent:        #34d399;
  --accent-strong: #059669;
  --accent-dim:    rgba(52,211,153,0.12);
  --accent-border: rgba(52,211,153,0.25);
  --accent-glow:   rgba(52,211,153,0.35);
  --status-talking:#34d399;
  --status-ringing:#d29922;
  --status-queued: #8b949e;
  --status-danger: #f85149;
  --mini-card-from:#052e1a;
  --mini-card-to:  #041a0f;

  color-scheme: dark;
}
```

- [ ] **Step 3: 키프레임 교체 및 추가**

`apps/web/src/styles/index.css` 205–213행의 기존 `@keyframes waveform` 을 아래로 교체하고, 바로 아래에 새 `@keyframes pulse` 를 추가 (기존 `pulse-green`/`pulse-red`는 그대로 둠).

```css
@keyframes waveform {
  0%, 100% { height: 3px; }
  50%       { height: 12px; }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.45; }
}
```

- [ ] **Step 4: 빌드 확인**

```bash
cd apps/web && npm run build
```

Expected: `tsc -b` 에러 없음, Vite build 성공. CSS 변수 교체는 TS 컴파일에 영향 없음.

- [ ] **Step 5: 다크 모드 시각 확인**

```bash
cd apps/web && npm run dev
```

브라우저에서 `http://localhost:5173?mode=full` 열고 `data-theme="dark"` 로 설정 (DevTools에서 `document.documentElement.dataset.theme='dark'` 실행 또는 테마 토글 클릭).

확인 사항:
- 배경이 `#0d1117` 로 어둡게 변경됨
- 강조 색상이 파란색 → 에메랄드 녹색 `#34d399` 로 변경됨
- 텍스트 색상 `#e6edf3` 가 배경 대비 읽기 편함
- 라이트 모드는 깨진 상태여도 OK (스펙 Section 9 "임시 회귀" 명시)

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/styles/index.css
git commit -m "feat(web): switch dark theme palette to dark pro + emerald

Replace [data-theme='dark'] CSS variables with GitHub-style dark pro background (#0d1117) and emerald accent (#34d399). Add new alias variables (--bg-*, --accent-*, --status-*, --mini-card-*) for upcoming redesigned components. Update waveform keyframe to 3px–12px for Mini card sizing and add generic pulse keyframe.

Spec: docs/superpowers/specs/2026-04-20-agent-portal-redesign.md Section 6"
```

---

## Chunk 2: 네비게이션 셸 (SideNav + TopAppBar)

56px 아이콘 전용 사이드바와 46px 다크 프로 탑바. FullShell/MiniShell에서 함께 쓰이므로 먼저 교체.

### Task 2: `SideNav.tsx` 전면 교체 (56px 아이콘 전용)

**Files:**
- Modify: `apps/web/src/components/SideNav.tsx` (전면 교체)
- Reference: `.superpowers/brainstorm/53772-1776690424/sidebar-style.html` A 옵션

**중요 — 모드 토글 이관**: 기존 `SideNav.tsx` 는 Full↔Mini 모드 토글을 포함하고 있음. 새 SideNav 에서는 이 토글을 **제거**하며, Task 3 `TopAppBar.tsx` 가 미니 토글을 이관받음. 따라서 **Task 2 와 Task 3 은 같은 커밋 세트로 묶여 실행**해야 함 (Task 2 단독 배포 시 Mini 전환 수단이 없어짐).

- [ ] **Step 1: 기존 SideNav 대체 구현**

`apps/web/src/components/SideNav.tsx` 전체를 아래로 교체:

```tsx
import { useUiStore, type FullWorkspaceSection } from '../store/useUiStore';
import { useAuthStore } from '../store/useAuthStore';

interface NavItem {
  key: FullWorkspaceSection;
  label: string;
  icon: string; // Material Symbols name
}

const ITEMS: NavItem[] = [
  { key: 'overview', label: '개요', icon: 'dashboard' },
  { key: 'call', label: '콜 센터', icon: 'headset_mic' },
  { key: 'queues', label: '큐 현황', icon: 'stacked_line_chart' },
  { key: 'history', label: '이력', icon: 'history' },
];

export function SideNav() {
  const fullSection = useUiStore((s) => s.fullSection);
  const setFullSection = useUiStore((s) => s.setFullSection);
  const agent = useAuthStore((s) => s.agent);
  const initial = agent?.name?.[0] ?? 'A';

  return (
    <aside
      className="fixed left-0 top-0 z-40 hidden h-screen w-14 flex-col items-center py-3 md:flex"
      style={{
        background: 'var(--bg-base)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      {/* 로고 */}
      <div
        className="mb-3 flex h-[30px] w-[30px] items-center justify-center rounded-lg text-[11px] font-extrabold text-white"
        style={{
          background: 'linear-gradient(135deg, var(--accent-strong), var(--accent))',
          boxShadow: '0 0 12px var(--accent-glow)',
        }}
        title="KASTER CTI"
      >
        K
      </div>

      {/* 네비 아이콘 */}
      <nav className="flex flex-col gap-1">
        {ITEMS.map((item) => {
          const isActive = item.key === fullSection;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setFullSection(item.key)}
              title={item.label}
              className="relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors"
              style={{
                background: isActive ? 'var(--accent-dim)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'var(--bg-elevated)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              {isActive && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r"
                  style={{ background: 'var(--accent)' }}
                />
              )}
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                {item.icon}
              </span>
            </button>
          );
        })}
      </nav>

      {/* 하단 아바타 */}
      <div
        className="mt-auto flex h-[30px] w-[30px] items-center justify-center rounded-full text-[11px] font-bold"
        style={{
          background: 'var(--bg-raised)',
          color: 'var(--accent)',
        }}
        title={agent?.name ?? '상담원'}
      >
        {initial}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: 타입체크**

```bash
cd apps/web && npm run build
```

Expected: 성공. `FullWorkspaceSection` 타입이 기존 그대로라면 무결함.

- [ ] **Step 3: 시각 확인**

`npm run dev` 후 브라우저에서 Full 모드 열고 확인:
- 좌측 사이드바 폭이 256px → 56px 로 축소됨
- 4개 아이콘 (dashboard/headset_mic/stacked_line_chart/history) 렌더
- 활성 아이콘에 좌측 3px 에메랄드 바 + 녹색 dim 배경 표시
- 호버 시 툴팁 (브라우저 기본 `title`) 노출
- 아래쪽 아바타 원형 표시

**주의**: FullShell 쪽 `pl-64` (64×4 = 256px padding) 등 사이드바 폭 전제 코드가 아직 남아있으면 레이아웃이 어긋나 보일 수 있음 — 이는 Task 5 에서 처리.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/components/SideNav.tsx
git commit -m "feat(web): redesign SideNav as 56px icon-only rail

Replace w-64 labelled sidebar with 56px icon rail. Nav items unchanged (overview/call/queues/history). Add emerald glow logo, active indicator bar, hover-aware background. Tooltips via native title attribute."
```

### Task 3: `TopAppBar.tsx` 전면 교체 (46px 다크 프로 탑바, Mini 토글 포함)

**Files:**
- Modify: `apps/web/src/components/TopAppBar.tsx` (전면 교체)

**중요**: 기존 `SideNav.tsx` 가 보유하던 Full↔Mini 모드 토글이 Task 2 에서 제거되므로, **이 Task 에서 반드시 Mini 토글을 포함**해야 함.

- [ ] **Step 1: 전체 교체 구현**

`apps/web/src/components/TopAppBar.tsx` 전체를 아래로 교체:

```tsx
import { LogoutOutlined } from '@ant-design/icons';
import { logout } from '../api';
import { useCtiStore } from '../store/useCtiStore';
import { useUiStore, type FullWorkspaceSection } from '../store/useUiStore';
import { AgentStatusTag } from './AgentStatusTag';
import { ThemeToggle } from './ThemeToggle';

const SECTION_LABEL: Record<FullWorkspaceSection, string> = {
  overview: '개요',
  call: '콜 센터',
  queues: '큐 현황',
  history: '이력',
};

export function TopAppBar() {
  const agentSession = useCtiStore((s) => s.agentSession);
  const changeStatus = useCtiStore((s) => s.changeStatus);
  const fullSection = useUiStore((s) => s.fullSection);
  const setMode = useUiStore((s) => s.setMode);

  const onLogout = async () => {
    if (!window.confirm('현재 세션을 종료하시겠습니까?')) return;
    await logout();
    window.location.reload();
  };

  return (
    <header
      className="fixed top-0 right-0 z-30 flex h-[46px] items-center justify-between px-4"
      style={{
        left: 56,
        background: 'var(--bg-base)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <div className="flex items-center gap-3">
        <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
          {SECTION_LABEL[fullSection]}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <AgentStatusTag status={agentSession?.statusCode} onChange={changeStatus} />
        <div className="hidden md:flex flex-col items-end leading-tight">
          <span style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 600 }}>
            {agentSession?.agentName ?? '-'}
          </span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>
            내선 {agentSession?.extension ?? '-'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setMode('mini')}
          className="rounded-full px-3 py-1 text-[11px] font-semibold transition-colors"
          style={{
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
          }}
          title="미니 모드"
        >
          미니
        </button>

        <ThemeToggle compact />

        <button
          onClick={() => { void onLogout(); }}
          className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
          style={{ color: 'var(--status-danger)' }}
          title="로그아웃"
        >
          <LogoutOutlined />
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd apps/web && npm run build
```

Expected: 타입 에러 없음. `useUiStore.setMode` 가 `'full' | 'mini'` 를 받는지 (기존 시그니처 유지).

- [ ] **Step 3: 시각 확인**

`npm run dev` 후 브라우저에서 Full 모드로 접속:
- 탑바 높이 46px
- 좌측 레이블이 현재 `fullSection` 에 따라 '개요'/'콜 센터'/'큐 현황'/'이력' 로 바뀜
- 우측 위젯 순서: 상태 배지 → 에이전트 이름/내선 → 미니 chip → ThemeToggle → 로그아웃 아이콘
- 미니 chip 클릭 → Mini 모드로 전환되는지 확인
- `AgentStatusTag` 드롭다운이 46px 탑바 아래로 정상 펼쳐지는지 확인

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/components/TopAppBar.tsx
git commit -m "feat(web): redesign TopAppBar as 46px dark pro header

46px height, offset 56px from new SideNav. Section label (SECTION_LABEL map driven by useUiStore.fullSection) on the left; status badge, agent info, mini-mode toggle chip, theme toggle, and logout icon on the right. Mini toggle migrated here from SideNav.

Spec: docs/superpowers/specs/2026-04-20-agent-portal-redesign.md Section 3.2"
```

---

## Chunk 3: CallListPanel 추출 및 FullShell 4열 고정 레이아웃

`fullSection === 'call'` 분기의 인라인 콜 목록을 `CallListPanel.tsx` 로 추출하고, FullShell을 `SideNav + CallListPanel + WorkPanel + KpiPanel` 4열 고정 구조로 재구성.

### Task 4: `CallListPanel.tsx` 신규 생성

**Files:**
- Create: `apps/web/src/components/CallListPanel.tsx`
- Reference: `apps/web/src/layout/FullShell.tsx` 256–383행 (추출 출처)

- [ ] **Step 1: 추출 원본 확인**

```bash
cd apps/web && sed -n '256,383p' src/layout/FullShell.tsx
```

기존 Antd `Input` + `Select` 필터와 콜 카드 목록 JSX를 확인. `useCtiStore` 에서 `activeCalls`, `selectedCallId`, `selectCall` 셀렉터 사용 여부를 파악.

- [ ] **Step 2: `CallListPanel.tsx` 작성**

`apps/web/src/components/CallListPanel.tsx` 신규 생성:

```tsx
import { useState } from 'react';
import { useCtiStore } from '../store/useCtiStore';
import { CALL_STATUS_LABEL, CALL_STATUS_COLOR } from './statusMeta';

type FilterMode = 'all' | 'talking' | 'queued';

const CHIPS: { key: FilterMode; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'talking', label: '통화 중' },
  { key: 'queued', label: '대기열' },
];

export function CallListPanel() {
  const activeCalls = useCtiStore((s) => s.activeCalls);
  const selectedCallId = useCtiStore((s) => s.selectedCallId);
  const selectCall = useCtiStore((s) => s.selectCall);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');

  const filtered = activeCalls.filter((c) => {
    if (filter === 'talking' && c.sessionStatus !== 'TALKING') return false;
    if (filter === 'queued' && c.sessionStatus !== 'QUEUED') return false;
    if (q && !(c.ani?.includes(q) || c.customer?.customerName?.includes(q))) return false;
    return true;
  });

  return (
    <aside
      className="flex h-full w-[240px] flex-shrink-0 flex-col"
      style={{
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-3"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 13 }}>
          활성 통화
        </span>
        <span
          className="rounded px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
        >
          {activeCalls.length}
        </span>
      </div>

      <div className="flex flex-col gap-2 px-3 py-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="번호/이름 검색"
          className="h-8 rounded px-2 text-[12px] outline-none"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        />
        <div className="flex gap-1">
          {CHIPS.map((chip) => {
            const active = chip.key === filter;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setFilter(chip.key)}
                className="flex-1 rounded py-1 text-[11px] font-semibold transition-colors"
                style={{
                  background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  border: active ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)',
                }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {filtered.map((call) => {
          const selected = call.callId === selectedCallId;
          const statusLabel = CALL_STATUS_LABEL[call.sessionStatus] ?? call.sessionStatus;
          const statusColor = CALL_STATUS_COLOR[call.sessionStatus] ?? 'var(--text-secondary)';
          return (
            <button
              key={call.callId}
              type="button"
              onClick={() => selectCall(call.callId)}
              className="mb-2 block w-full rounded-md p-3 text-left transition-colors"
              style={{
                background: selected ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                border: `1px solid ${selected ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
              }}
            >
              <div style={{ color: statusColor, fontSize: 10, fontWeight: 600, marginBottom: 2 }}>
                ● {statusLabel}
              </div>
              <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
                {call.customer?.customerName ?? call.ani ?? '미식별'}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                {call.queueName} · {call.ani}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
```

**주의**: 필드명은 `apps/web/src/types/cti.ts` 의 `ActiveCall` 인터페이스와 일치해야 함 (`callId`, `sessionStatus`, `ani`, `customer?.customerName`, `queueName`). 상태 레이블은 **Task 6 에서 도입하는** `statusMeta.ts` 의 `CALL_STATUS_LABEL` / `CALL_STATUS_COLOR` 를 사용. **Task 4 는 Task 6 이후에 실행**하거나, 임시로 상태 코드를 그대로 표시한 뒤 Task 6 완료 후 레이블 적용.

- [ ] **Step 3: 빌드 확인**

```bash
cd apps/web && npm run build
```

Expected: 타입 에러 없이 성공.

- [ ] **Step 4: 커밋 (FullShell 연결 전)**

```bash
git add apps/web/src/components/CallListPanel.tsx
git commit -m "feat(web): add CallListPanel extracted from FullShell

Dedicated 240px panel with search box and filter chips (all/talking/queued). Subscribes to useCtiStore directly — no prop drilling. Not wired into FullShell yet; see next commit."
```

### Task 5: `FullShell.tsx` 4열 고정 레이아웃으로 재구성

**Files:**
- Modify: `apps/web/src/layout/FullShell.tsx`

- [ ] **Step 1: 레이아웃 골격 재작성**

`FullShell.tsx` 의 최상위 JSX를 아래 골격으로 재구성 (기존 비즈니스 로직/핸들러는 보존):

```tsx
return (
  <div
    className="flex h-screen w-screen overflow-hidden"
    style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
  >
    <SideNav />
    <div className="flex flex-1 flex-col pl-14"> {/* 56px 사이드바 오프셋 */}
      <TopAppBar />
      <div className="flex flex-1 overflow-hidden pt-[46px]"> {/* 탑바 오프셋 */}
        <CallListPanel />
        <main className="flex-1 overflow-y-auto p-5">
          {/* fullSection 분기 — WorkPanel 내부 콘텐츠만 전환 */}
          {fullSection === 'overview' && <OverviewContent />}
          {fullSection === 'call' && <CallWorkContent />}
          {fullSection === 'queues' && <QueuesContent />}
          {fullSection === 'history' && <HistoryContent />}
        </main>
        <aside
          className="w-[170px] flex-shrink-0 overflow-y-auto p-3"
          style={{
            background: 'var(--bg-surface)',
            borderLeft: '1px solid var(--border-subtle)',
          }}
        >
          <KpiPanel />
        </aside>
      </div>
    </div>
  </div>
);
```

주요 변경점:
- **항상 4열 렌더**: `CallListPanel` 과 `KpiPanel` 이 모든 섹션에서 항상 표시
- `fullSection` 은 `main` 영역의 **내부 콘텐츠만** 전환 (기존처럼 전체 레이아웃을 스위칭하지 않음)
- 기존 `fullSection === 'call'` 블록의 콜 목록 JSX는 `CallListPanel` 로 이미 추출됐으므로 **여기서 제거**
- 기존 `fullSection === 'overview'` 에서 KpiPanel 을 렌더하던 코드도 **제거** (우측 aside 로 이동)

- [ ] **Step 2: 섹션별 콘텐츠를 인라인 JSX 블록으로 배치 (함수 분리 금지)**

기존 `FullShell()` 의 store 구독/핸들러들(`pickup`, `toggleMute`, `toggleHold`, `transfer`, `hangup`, `saveMemo` 등)은 최상위 함수 바디에 남아있음. 별도 `OverviewContent` / `CallWorkContent` 함수로 분리하면 props 드릴링이 강제됨 — **대신 각 섹션 JSX 를 최상위에서 인라인으로 배치**:

```tsx
{fullSection === 'overview' && (
  <>
    {/* 이벤트 로그 + 요약 등 — 기존 overview JSX 중 KpiPanel/콜 목록 제외한 나머지 */}
  </>
)}
{fullSection === 'call' && (
  <>
    <CurrentCallPanel
      call={selectedCall}
      onPickup={pickup}
      onToggleMute={toggleMute}
      onToggleHold={toggleHold}
      onHangup={hangup}
    />
    <ControlPanel
      call={selectedCall}
      onSaveMemo={saveMemo}
      onTransfer={transfer}
      /* ... 기존과 동일한 prop 목록 */
    />
  </>
)}
{fullSection === 'queues' && (
  <>
    {/* 기존 queues JSX 에서 KpiPanel 제거 */}
  </>
)}
{fullSection === 'history' && (
  <>{/* 기존 history JSX */}</>
)}
```

- [ ] **Step 3: 추출된 콜 목록 및 이관된 KpiPanel 잔재 제거**

`FullShell.tsx` 에서 다음을 삭제:
- 256–383행의 콜 목록 인라인 블록 (CallListPanel 로 이관됨)
- `overview`/`queues` 분기에서 `<KpiPanel />` 렌더 (우측 aside 로 이관됨)
- 콜 목록 필터용 로컬 state (`callQuery`, `callStatusFilter` 등 이름이 있다면)
- 위 삭제로 참조되지 않게 된 antd import (`Input`, `Select` 등) — `npm run build` 가 unused 에러로 알려줌

확인:

```bash
cd apps/web && npm run build 2>&1 | grep -E "(TS6133|TS6192|unused)"
```

Expected: unused import 경고 없음. 있으면 해당 import 줄 제거.

- [ ] **Step 4: 빌드 확인**

```bash
cd apps/web && npm run build
```

Expected: 타입 에러 없음. 사이드바/탑바 폭 오프셋(`pl-14`, `pt-[46px]`)이 올바른지 런타임 확인 필요.

- [ ] **Step 5: 4열 시각 확인**

`npm run dev` 후 브라우저에서:
- `?mode=full` 로 접속 → 4열(SideNav 56px + CallListPanel 240px + Main + KpiPanel 170px) 동시 렌더 확인
- 좌측 사이드바의 overview/call/queues/history 아이콘 클릭 → `main` 영역 콘텐츠만 교체되고 CallListPanel/KpiPanel 은 그대로 유지되는지 확인
- 승인 목업 `.superpowers/brainstorm/53772-1776690424/full-and-mini.html` 의 Full 모드와 대조

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/layout/FullShell.tsx
git commit -m "refactor(web): restructure FullShell as persistent 4-column layout

SideNav (56px) + CallListPanel (240px) + main (flex-1) + KpiPanel (170px) are always rendered. fullSection switches only the main content. Removes section-level branching that previously hid CallListPanel/KpiPanel."
```

---

## Chunk 4: WorkPanel 컴포넌트 리팩터

`CurrentCallPanel`, `ControlPanel`, `KpiPanel`, `AgentStatusTag`, `statusMeta` 의 스타일을 새 디자인 시스템으로 교체.

### Task 6: `statusMeta.ts` 한글 레이블 매핑 추가

**Files:**
- Modify: `apps/web/src/components/statusMeta.ts`

- [ ] **Step 1: 기존 파일 확인**

```bash
cat apps/web/src/components/statusMeta.ts
```

기존 구조 파악 후, 콜 상태와 에이전트 상태를 한글 레이블로 매핑:

- [ ] **Step 2: 한글 매핑 확장**

```ts
// 기존 export 보존 + 추가
export const CALL_STATUS_LABEL: Record<string, string> = {
  QUEUED: '대기열',
  RINGING_AGENT: '벨 울림',
  TALKING: '통화 중',
  AFTER_CALL_WORK: '후처리',
  TRANSFERRING: '전환 중',
  ENDED: '종료',
};

export const CALL_STATUS_COLOR: Record<string, string> = {
  QUEUED: 'var(--status-queued)',
  RINGING_AGENT: 'var(--status-ringing)',
  TALKING: 'var(--status-talking)',
  AFTER_CALL_WORK: 'var(--text-secondary)',
  TRANSFERRING: 'var(--status-ringing)',
  ENDED: 'var(--status-danger)',
};
```

- [ ] **Step 3: 빌드 + 커밋**

```bash
cd apps/web && npm run build
git add apps/web/src/components/statusMeta.ts
git commit -m "feat(web): add Korean label and CSS-var color maps to statusMeta"
```

### Task 7: `AgentStatusTag.tsx` TONE 맵 교체

**Files:**
- Modify: `apps/web/src/components/AgentStatusTag.tsx`

- [ ] **Step 1: 기존 TONE 맵 확인**

```bash
cat apps/web/src/components/AgentStatusTag.tsx
```

`AgentStatusCode` 타입의 8개 상태 코드 확인: AVAILABLE/TALKING/RINGING/AFTER_CALL_WORK/BREAK/MEAL/TRAINING/MANUAL_PAUSED.

- [ ] **Step 2: TONE 맵 교체**

기존 Tailwind-class 기반 TONE 을 스펙 Section 7.2 의 CSS-변수 기반 인라인 스타일 TONE 으로 교체:

```ts
const TONE: Record<AgentStatusCode, { dot: string; text: string; bg: string; border: string }> = {
  AVAILABLE:       { dot: 'var(--status-talking)', text: 'var(--status-talking)', bg: 'var(--accent-dim)', border: 'var(--accent-border)' },
  TALKING:         { dot: 'var(--status-talking)', text: 'var(--status-talking)', bg: 'var(--accent-dim)', border: 'var(--accent-border)' },
  RINGING:         { dot: 'var(--status-ringing)', text: 'var(--status-ringing)', bg: 'rgba(210,153,34,0.10)', border: 'rgba(210,153,34,0.25)' },
  AFTER_CALL_WORK: { dot: '#8b949e', text: '#8b949e', bg: 'rgba(139,148,158,0.10)', border: 'rgba(139,148,158,0.20)' },
  BREAK:           { dot: '#d29922', text: '#d29922', bg: 'rgba(210,153,34,0.08)', border: 'rgba(210,153,34,0.20)' },
  MEAL:            { dot: '#d29922', text: '#d29922', bg: 'rgba(210,153,34,0.08)', border: 'rgba(210,153,34,0.20)' },
  TRAINING:        { dot: '#8b949e', text: '#8b949e', bg: 'rgba(139,148,158,0.08)', border: 'rgba(139,148,158,0.18)' },
  MANUAL_PAUSED:   { dot: '#8b949e', text: '#8b949e', bg: 'rgba(139,148,158,0.08)', border: 'rgba(139,148,158,0.18)' },
};
```

- [ ] **Step 3: 렌더 JSX를 인라인 스타일 기반으로 교체**

기존에 `bg-primary`, `text-tertiary` 등 Tailwind 클래스로 칠하던 부분을 `style={{ background: tone.bg, color: tone.text, borderColor: tone.border }}` 형태로 교체. dot 은 `<span style={{ background: tone.dot, animation: 'pulse 2s infinite' }} />` 패턴.

- [ ] **Step 4: 빌드 + 시각 + 커밋**

```bash
cd apps/web && npm run build && npm run dev
```

에이전트 상태 드롭다운에서 모든 8개 상태를 전환해보며 각 색상 확인.

```bash
git add apps/web/src/components/AgentStatusTag.tsx
git commit -m "feat(web): restyle AgentStatusTag with CSS-var inline styles

Replace Tailwind TONE classes with CSS-variable inline styles driven by --status-* / --accent-*. TALKING now uses emerald (productive state), not red. All 8 agent status codes covered."
```

### Task 8: `CurrentCallPanel.tsx` Hero 카드 + 컨트롤 버튼 행 리팩터

**Files:**
- Modify: `apps/web/src/components/CurrentCallPanel.tsx`

- [ ] **Step 1: Hero 카드 컨테이너 스타일 교체**

외곽 컨테이너를 다음으로 교체 (기존 prop 시그니처/핸들러 보존):

```tsx
<section
  className="rounded-xl p-5"
  style={{
    background: 'linear-gradient(135deg, #0d2818, #0a1f14)',
    border: '1px solid var(--accent-border)',
    boxShadow: '0 0 24px rgba(52,211,153,0.08)',
  }}
>
  {/* 헤더: 아바타 + 고객정보 + 타이머 */}
  {/* 컨트롤 버튼 행 */}
</section>
```

- [ ] **Step 2: 헤더 영역 (아바타 44×44 + 고객정보 + 타이머)**

```tsx
<div className="flex items-center gap-4">
  <div
    className="flex h-11 w-11 items-center justify-center rounded-full"
    style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}
  >
    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{initial}</span>
  </div>
  <div className="flex-1">
    <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 16 }}>{customerName}</div>
    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{phone} · {queueName}</div>
  </div>
  <div
    style={{
      color: 'var(--accent)',
      fontSize: 28,
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
      textShadow: '0 0 16px var(--accent-glow)',
    }}
  >
    {formatDuration(elapsed)}
  </div>
</div>
```

- [ ] **Step 3: 컨트롤 버튼 행**

헤더 아래 배치:

```tsx
<div className="mt-4 flex items-center gap-2">
  <button
    type="button"
    onClick={onPickup}
    className="flex-1 rounded-md py-2 text-sm font-semibold text-white"
    style={{ background: 'var(--accent-strong)' }}
  >
    당겨받기
  </button>
  {/* 음소거/보류/전환: 36×36 아이콘 버튼 */}
  <IconButton icon="mic_off" onClick={onMute} />
  <IconButton icon="pause" onClick={onHold} />
  <IconButton icon="call_split" onClick={onTransfer} />
  <button
    type="button"
    onClick={onHangup}
    className="rounded-md px-3 py-2 text-sm font-semibold"
    style={{
      background: 'transparent',
      color: 'var(--status-danger)',
      border: '1px solid rgba(248,81,73,0.3)',
    }}
  >
    종료
  </button>
</div>
```

`IconButton` 은 이 파일 내 로컬 컴포넌트로 둠:
```tsx
function IconButton({ icon, onClick }: { icon: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-md"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-primary)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>
    </button>
  );
}
```

- [ ] **Step 4: 빌드 + 시각 + 커밋**

```bash
cd apps/web && npm run build && npm run dev
```

통화 중 상태로 전환하여 Hero 카드 + 컨트롤 버튼 확인.

```bash
git add apps/web/src/components/CurrentCallPanel.tsx
git commit -m "feat(web): restyle CurrentCallPanel as Hero card + control row

Gradient dark-emerald background with timer glow, 44x44 avatar, and 5-button control row (pickup-primary, mute/hold/transfer icon buttons, hangup with danger border)."
```

### Task 9: `ControlPanel.tsx` 탭 + 폼 영역 리팩터

**Files:**
- Modify: `apps/web/src/components/ControlPanel.tsx`

- [ ] **Step 1: 탭 스타일 교체**

활성 탭은 에메랄드 하단 2px border + `var(--accent)` 텍스트, 비활성 탭은 `var(--text-secondary)`.

```tsx
<nav className="flex gap-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
  {TABS.map((tab) => {
    const active = tab.key === activeTab;
    return (
      <button
        key={tab.key}
        onClick={() => setActiveTab(tab.key)}
        className="-mb-px pb-2 text-sm"
        style={{
          color: active ? 'var(--accent)' : 'var(--text-secondary)',
          fontWeight: active ? 600 : 400,
          borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        }}
      >
        {tab.label}
      </button>
    );
  })}
</nav>
```

- [ ] **Step 2: 폼 필드 + 저장 버튼 스타일 교체**

```tsx
<input
  className="w-full rounded px-3 py-2 text-sm outline-none"
  style={{
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
  }}
  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
/>

<button
  type="button"
  onClick={onSave}
  className="rounded-md px-4 py-2 text-sm font-semibold"
  style={{
    background: 'var(--accent-dim)',
    color: 'var(--accent)',
    border: '1px solid var(--accent-border)',
  }}
>
  저장
</button>
```

- [ ] **Step 3: 빌드 + 커밋**

```bash
cd apps/web && npm run build
git add apps/web/src/components/ControlPanel.tsx
git commit -m "feat(web): restyle ControlPanel tabs, form fields, save button"
```

### Task 10: `KpiPanel.tsx` 우측 스트립 스타일 리팩터

**Files:**
- Modify: `apps/web/src/components/KpiPanel.tsx`

- [ ] **Step 1: 세로 스택 레이아웃으로 전환**

기존 가로 그리드가 아니라 우측 170px 폭 스트립에 맞는 세로 스택으로 배치:

```tsx
<div className="flex flex-col gap-2">
  {items.map((item) => (
    <div
      key={item.key}
      className="rounded-md p-3"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div style={{ color: 'var(--text-secondary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {item.label}
      </div>
      <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 18, marginTop: 4 }}>
        {item.value}
      </div>
      {item.delta && (
        <div style={{ color: item.delta > 0 ? 'var(--accent)' : 'var(--status-danger)', fontSize: 11, marginTop: 2 }}>
          {item.delta > 0 ? '▲' : '▼'} {Math.abs(item.delta)}
        </div>
      )}
    </div>
  ))}
</div>
```

- [ ] **Step 2: 빌드 + 커밋**

```bash
cd apps/web && npm run build
git add apps/web/src/components/KpiPanel.tsx
git commit -m "feat(web): restyle KpiPanel as vertical stat strip"
```

---

## Chunk 5: Mini 모드 재구성

`MiniShell.tsx` 를 420px 고정 폭 카드로 섹션별 스타일 교체 (헤더 / 요약 그리드 / Active Call Card / 빠른 제어 / 메모).

### Task 11: `MiniShell.tsx` 전면 리팩터

**Files:**
- Modify: `apps/web/src/layout/MiniShell.tsx`
- Reference: `.superpowers/brainstorm/53772-1776690424/full-and-mini.html` 의 Mini 섹션

**중요 — 기존 store wiring 보존**: 기존 `MiniShell.tsx` (≈430줄) 는 `useCtiStore` 와 `useAuthStore` 에서 `agentSession`, `activeCalls`, `selectedCall`, `pickup`, `toggleMute`, `toggleHold`, `transfer`, `hangup`, `saveMemo`, `changeStatus`, `logout` 등을 구독/디스패치함. **스타일만 교체**하고 데이터/핸들러 wiring 은 그대로 유지. 아래 Step 의 JSX 조각에 등장하는 `agent`, `customerName`, `elapsed`, `onMute`, `switchToFull`, `logout` 등은 **기존 MiniShell 에서 이미 선언된 변수/함수의 플레이스홀더** — 실제 이름은 기존 파일과 매칭시킬 것.

- [ ] **Step 0: 기존 MiniShell 변수/핸들러 인벤토리**

```bash
cd apps/web && sed -n '1,60p' src/layout/MiniShell.tsx
```

최상위 함수 바디에 존재하는 store 구독 셀렉터와 이벤트 핸들러 이름을 메모. Step 1–6 의 JSX 를 붙이면서 플레이스홀더 이름을 실제 이름으로 치환.

- [ ] **Step 1: 외곽 컨테이너 420px 고정**

```tsx
<div
  className="mx-auto flex flex-col gap-3 p-3"
  style={{
    width: 420,
    minHeight: '100vh',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
  }}
>
  {/* Header / SummaryGrid / ActiveCallCard / QuickControls / NotesSection */}
</div>
```

- [ ] **Step 2: 헤더 (로고 + 에이전트 + 상태 배지)**

```tsx
<header
  className="flex items-center gap-3 rounded-lg p-3"
  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}
>
  <div
    className="flex h-9 w-9 items-center justify-center rounded-[10px] text-xs font-extrabold text-white"
    style={{
      background: 'linear-gradient(135deg, var(--accent-strong), var(--accent))',
      boxShadow: '0 0 10px var(--accent-glow)',
    }}
  >
    K
  </div>
  <div className="flex-1">
    <div style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
      KASTER CTI
    </div>
    <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>{agent.name}</div>
    <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>내선 {agent.extension}</div>
  </div>
  <div className="flex items-center gap-1">
    <ThemeToggle />
    <button onClick={switchToFull} title="전체 모드">⤢</button>
    <button onClick={logout} style={{ color: 'var(--status-danger)' }} title="로그아웃">⎋</button>
  </div>
  <AgentStatusTag />
</header>
```

- [ ] **Step 3: 요약 그리드 (3열)**

```tsx
<section className="grid grid-cols-3 gap-2">
  {[
    { label: '상태', value: agentStatusLabel },
    { label: '활성 통화', value: activeCalls.length },
    { label: '대기 큐', value: queuedCount },
  ].map((item) => (
    <div
      key={item.label}
      className="rounded-[9px] p-3 text-center"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
    >
      <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{item.label}</div>
      <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 14, marginTop: 2 }}>{item.value}</div>
    </div>
  ))}
</section>
```

- [ ] **Step 4: Active Call Card (그라디언트 + 파형)**

```tsx
<section
  className="relative overflow-hidden rounded-lg p-4"
  style={{
    background: 'linear-gradient(135deg, var(--mini-card-from), var(--mini-card-to))',
    border: '1px solid var(--accent-border)',
  }}
>
  {/* glow 의사요소는 별도 <div> 로 (transition 충돌 회피) */}
  <div className="pointer-events-none absolute -left-6 -top-6 h-24 w-24 rounded-full" style={{ background: 'var(--accent-glow)', filter: 'blur(30px)' }} />
  <div className="pointer-events-none absolute -right-6 -bottom-6 h-24 w-24 rounded-full" style={{ background: 'var(--accent-glow)', filter: 'blur(30px)' }} />

  <div className="relative flex items-center gap-3">
    <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--accent-dim)' }}>
      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{customerInitial}</span>
    </div>
    <div className="flex-1">
      <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{customerName}</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{phone}</div>
    </div>
  </div>

  <div className="relative mt-3 grid grid-cols-2 gap-3">
    <div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>통화시간</div>
      <div className="flex items-end gap-2">
        <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>
          {formatDuration(elapsed)}
        </div>
        <div className="flex items-end gap-0.5">
          {[0, 0.15, 0.30, 0.45].map((delay, i) => (
            <div
              key={i}
              className="waveform-bar"
              style={{
                width: 3,
                background: 'var(--accent)',
                animationDelay: `${delay}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
    <div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>전환상태</div>
      <div style={{ color: 'var(--text-primary)', fontSize: 13 }}>{transferStateLabel}</div>
    </div>
  </div>
</section>
```

**중요**: `waveform-bar` 는 반드시 `<div>` 요소에 적용 — pseudo-element(::before/::after) 에 적용하면 global `*::before { transition }` 규칙과 충돌하여 높이가 ease 처리됨 (스펙 Section 5.1 경고).

- [ ] **Step 5: 빠른 제어 (2×2 그리드)**

```tsx
<section className="grid grid-cols-2 gap-2">
  {[
    { key: 'mute', icon: 'mic_off', label: '음소거', onClick: onMute },
    { key: 'hold', icon: 'pause', label: '보류', onClick: onHold },
    { key: 'transfer', icon: 'call_split', label: '전환', onClick: onTransfer },
    { key: 'hangup', icon: 'call_end', label: '종료', onClick: onHangup, danger: true },
  ].map((btn) => (
    <button
      key={btn.key}
      onClick={btn.onClick}
      className="flex flex-col items-center justify-center rounded-md py-3"
      style={{
        minHeight: 70,
        background: 'var(--bg-elevated)',
        border: `1px solid ${btn.danger ? 'rgba(248,81,73,0.3)' : 'var(--border-subtle)'}`,
        color: btn.danger ? 'var(--status-danger)' : 'var(--text-primary)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{btn.icon}</span>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
        {btn.label}
      </span>
    </button>
  ))}
</section>
```

- [ ] **Step 6: 메모 및 후처리**

```tsx
<section className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
  <div className="grid grid-cols-2 gap-2">
    <select /* 결과코드 */ />
    <input /* 전환내선 */ />
  </div>
  <textarea rows={4} placeholder="메모" className="mt-2 w-full rounded px-2 py-1 text-sm" style={{ background: 'var(--bg-raised)', color: 'var(--text-primary)' }} />
  <button type="button" onClick={onSaveMemo} className="btn-primary-gradient mt-2 w-full rounded-md py-2 text-sm font-semibold">
    저장
  </button>
</section>
```

- [ ] **Step 7: 빌드 + 시각 확인**

```bash
cd apps/web && npm run build && npm run dev
```

브라우저에서 `http://localhost:5173?mode=mini` 열고 5개 섹션(헤더/요약/Active Call/빠른 제어/메모) 레이아웃 및 파형 애니메이션 확인. 승인 목업의 Mini 와 대조.

- [ ] **Step 8: 커밋**

```bash
git add apps/web/src/layout/MiniShell.tsx
git commit -m "feat(web): redesign MiniShell as 420px dark pro card

Five sections: header (logo/agent/status), summary grid (3-col), Active Call Card with emerald gradient + waveform, 2x2 quick controls, notes section with result code/transfer extension/memo/gradient save button."
```

---

## Chunk 6: 최종 통합 검증

빌드/시각 스모크 테스트 및 승인 목업과의 최종 대조.

### Task 12: 전체 스모크 테스트 및 문서 업데이트

**Files:**
- Verify: `apps/web/**`
- Optional modify: `CLAUDE.md` (레이아웃 설명 문단 업데이트)

- [ ] **Step 1: 클린 빌드**

```bash
cd apps/web && npm run build
```

Expected: TypeScript 에러 0, Vite 빌드 성공.

- [ ] **Step 1.5: 비즈니스 로직 무변경 게이트**

```bash
git diff --stat main -- apps/web/src/api apps/web/src/ws apps/web/src/store/useCtiStore.ts apps/web/src/store/useAuthStore.ts
```

Expected: 해당 경로에 변경 없음 (빈 출력). 변경이 나타나면 원인 확인 후 비즈니스 로직 수정을 되돌리거나 별도 이슈로 분리.

- [ ] **Step 2: 다크 모드 Full 전수 시나리오**

`npm run dev` 후 브라우저에서 Mock 모드로:
- `?mode=full` 접속 → 4열 레이아웃 렌더 확인
- 사이드바 4개 아이콘 순차 클릭 → `main` 영역만 전환, CallListPanel/KpiPanel 유지
- 콜 목록에서 검색/필터 칩 동작 확인
- 콜 카드 클릭 → Hero 카드에 선택된 콜 정보 반영
- 컨트롤 버튼 행(당겨받기/음소거/보류/전환/종료) 및 탭 클릭 동작
- 에이전트 상태 드롭다운에서 AVAILABLE/TALKING/RINGING/AFTER_CALL_WORK/BREAK/MEAL/TRAINING/MANUAL_PAUSED 8개 상태 전환 → TONE 맵 색상 확인

- [ ] **Step 3: 다크 모드 Mini 전수 시나리오**

- `?mode=mini` 접속 → 420px 카드 렌더 확인
- 5개 섹션 모두 표시, 파형 애니메이션 (4개 바 stagger) 동작
- 빠른 제어 2×2 버튼 hover/클릭
- 저장 버튼(에메랄드 그라디언트) 클릭

- [ ] **Step 4: Full ↔ Mini 모드 전환**

- Full 탑바의 Mini 전환 chip 클릭 → Mini 렌더
- Mini 헤더의 전체 모드 전환 버튼 클릭 → Full 렌더
- URL `?mode=...` 동기화 확인

- [ ] **Step 5: 접근성 퀵 체크**

- 모든 아이콘 버튼에 `title` 또는 `aria-label` 존재
- 텍스트 대비 (`#e6edf3` on `#0d1117`) WCAG AA 통과
- 키보드 탭 네비게이션으로 주요 버튼 도달 가능

- [ ] **Step 6: (선택) CLAUDE.md 레이아웃 섹션 업데이트**

`CLAUDE.md` 의 "레이아웃:" 블록에서 기존 `FullShell` 설명을 새 4열 구조로 업데이트.

- [ ] **Step 7: 최종 커밋**

수정이 있었다면:

```bash
git add -A
git commit -m "docs(web): update CLAUDE.md to reflect new agent portal layout"
```

없으면 생략.

- [ ] **Step 8: PR 준비**

```bash
git log main..HEAD --oneline
git diff main...HEAD --stat
```

커밋 히스토리를 확인하여 각 Chunk 별로 커밋이 분리되어 있는지 검증. 필요 시 PR 생성.

---

## 완료 기준

- [x] 스펙 문서 승인
- [ ] `npm run build` 통과
- [ ] Full 모드 4열 고정 레이아웃 + 4개 섹션 전환 동작
- [ ] Mini 모드 420px 카드 5개 섹션 렌더 + 파형 애니메이션
- [ ] 다크 모드 8개 에이전트 상태 모두 에메랄드/앰버/그레이 톤으로 표시
- [ ] 비즈니스 로직(API/WS/Zustand) 무변경 (git diff 에 `api/`, `store/useCtiStore.ts`, `ws/` 변경 없음)
- [ ] 승인 목업과 시각적 일치 (`.superpowers/brainstorm/53772-1776690424/full-and-mini.html`)
