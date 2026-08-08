# Mobile Redesign Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan.

**Goal:** Fix 3 mobile issues: apps/web bottom tab nav, admin header solid bg, admin tables/modals responsive.

**Architecture:** Minimal-change approach — new BottomTabBar component for web, CSS-only fixes for admin (avoids touching 25+ individual files).

**Tech Stack:** React 18, Tailwind CSS (web), Ant Design 5 + CSS (admin), TypeScript

> **Note:** No Jest setup exists. Verify visually in browser after each task.

---

## Chunk 1: apps/admin CSS fixes (header + tables + modals)

**Files:**
- Modify: `apps/admin/src/styles.css`

- [ ] **Step 1: Read current styles.css to confirm end of file**

- [ ] **Step 2: Append admin mobile CSS**

Add to the existing `@media (max-width: 767px)` block (the one added in phase 1):
```css
  .app-header {
    background: rgba(255, 255, 255, 1);
    backdrop-filter: none;
  }
```

Then append new rules AFTER the existing media block:
```css
/* Tables: horizontal scroll on mobile */
@media (max-width: 767px) {
  .ant-table-wrapper {
    overflow-x: auto;
  }
  .ant-table table {
    min-width: 600px;
  }
}

/* Modals: clamp to viewport width on mobile */
@media (max-width: 767px) {
  .ant-modal {
    max-width: calc(100vw - 16px) !important;
    margin: 8px auto !important;
  }
  .ant-modal-content {
    padding: 16px !important;
  }
}
```

- [ ] **Step 3: Commit**
```bash
git add apps/admin/src/styles.css
git commit -m "style: admin mobile header solid bg, table scroll, modal clamp"
```

---

## Chunk 2: apps/web BottomTabBar component

**Files:**
- Create: `apps/web/src/components/BottomTabBar.tsx`

- [ ] **Step 1: Create BottomTabBar.tsx**

```tsx
import { useUiStore, type FullWorkspaceSection } from '../store/useUiStore';

const TABS: { key: FullWorkspaceSection; label: string; icon: string }[] = [
  { key: 'overview', label: '개요', icon: 'dashboard' },
  { key: 'call', label: '콜센터', icon: 'headset_mic' },
  { key: 'queues', label: '큐', icon: 'stacked_line_chart' },
  { key: 'history', label: '이력', icon: 'history' },
];

export function BottomTabBar() {
  const fullSection = useUiStore((s) => s.fullSection);
  const setFullSection = useUiStore((s) => s.setFullSection);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-14 border-t border-outline-variant/20 bg-surface-container-lowest md:hidden">
      {TABS.map((tab) => {
        const isActive = tab.key === fullSection;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFullSection(tab.key)}
            className={`flex flex-1 flex-col items-center justify-center gap-1 transition-colors ${
              isActive ? 'text-primary' : 'text-on-surface-variant'
            }`}
          >
            <span className="material-symbols-outlined text-xl leading-none">
              {tab.icon}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add apps/web/src/components/BottomTabBar.tsx
git commit -m "feat: add BottomTabBar component for mobile navigation"
```

---

## Chunk 3: apps/web SideNav, FullShell, TopAppBar updates

**Files:**
- Modify: `apps/web/src/components/SideNav.tsx`
- Modify: `apps/web/src/layout/FullShell.tsx`
- Modify: `apps/web/src/components/TopAppBar.tsx`

- [ ] **Step 1: SideNav — hide on mobile**

In `SideNav.tsx`, find the root `<aside>` element:
```tsx
<aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-surface-container-low pb-8 pt-20">
```
Replace with:
```tsx
<aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col bg-surface-container-low pb-8 pt-20 md:flex">
```

- [ ] **Step 2: FullShell — responsive main + add BottomTabBar**

In `FullShell.tsx`:

1. Add import at top:
```tsx
import { BottomTabBar } from '../components/BottomTabBar';
```

2. Find the main element:
```tsx
      <main className="ml-64 min-h-screen p-8 pt-24">
```
Replace with:
```tsx
      <main className="min-h-screen p-4 pb-20 pt-20 md:ml-64 md:p-8 md:pb-0 md:pt-24">
```

3. Add `<BottomTabBar />` as last child inside the root div, just before the closing `</div>`:
```tsx
      <BottomTabBar />
    </div>
```

- [ ] **Step 3: TopAppBar — tighten mobile padding, hide agent block**

In `TopAppBar.tsx`:

1. Find the header element:
```tsx
    <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between bg-surface-container-lowest px-8 shadow-panel">
```
Replace with:
```tsx
    <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between bg-surface-container-lowest px-4 shadow-panel md:px-8">
```

2. Find the left section opening:
```tsx
      <div className="flex items-center gap-6">
```
Replace with:
```tsx
      <div className="flex items-center gap-2 md:gap-6">
```

3. Find the agent avatar+name block:
```tsx
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary-fixed">
            <span className="material-symbols-outlined text-base text-primary">person</span>
          </div>
          <div>
            <p className="font-headline text-sm font-bold leading-none text-on-surface">
              {agentSession?.agentName ?? '-'}
            </p>
            <p className="mt-0.5 text-[10px] font-medium tracking-wide text-on-surface-variant">
              내선 {agentSession?.extension ?? '-'}
            </p>
          </div>
        </div>
```
Replace with:
```tsx
        <div className="hidden items-center gap-3 md:flex">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary-fixed">
            <span className="material-symbols-outlined text-base text-primary">person</span>
          </div>
          <div>
            <p className="font-headline text-sm font-bold leading-none text-on-surface">
              {agentSession?.agentName ?? '-'}
            </p>
            <p className="mt-0.5 text-[10px] font-medium tracking-wide text-on-surface-variant">
              내선 {agentSession?.extension ?? '-'}
            </p>
          </div>
        </div>
```

4. Find the right section:
```tsx
      <div className="flex items-center gap-4">
```
Replace with:
```tsx
      <div className="flex items-center gap-2 md:gap-4">
```

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/components/SideNav.tsx apps/web/src/layout/FullShell.tsx apps/web/src/components/TopAppBar.tsx
git commit -m "feat: mobile bottom tab nav, hide sidenav on mobile, tighten topbar"
```

---

## Chunk 4: Deploy and verify

- [ ] **Step 1: scp changed files to server**

```bash
scp apps/web/src/components/BottomTabBar.tsx blueadm@49.247.46.86:/home/blueadm/kaster_cti/apps/web/src/components/BottomTabBar.tsx
scp apps/web/src/components/SideNav.tsx blueadm@49.247.46.86:/home/blueadm/kaster_cti/apps/web/src/components/SideNav.tsx
scp apps/web/src/layout/FullShell.tsx blueadm@49.247.46.86:/home/blueadm/kaster_cti/apps/web/src/layout/FullShell.tsx
scp apps/web/src/components/TopAppBar.tsx blueadm@49.247.46.86:/home/blueadm/kaster_cti/apps/web/src/components/TopAppBar.tsx
scp apps/admin/src/styles.css blueadm@49.247.46.86:/home/blueadm/kaster_cti/apps/admin/src/styles.css
```

- [ ] **Step 2: Verify containers are running**
```bash
ssh blueadm@49.247.46.86 "docker ps --filter name=kaster --format 'table {{.Names}}\t{{.Status}}'"
```

- [ ] **Step 3: Visual verification on mobile**
  - apps/web (port 5173): SideNav hidden, bottom 4-tab bar visible ✓
  - Tap each tab → section switches ✓
  - Desktop: SideNav back, bottom bar hidden ✓
  - apps/admin (port 5174): Header fully white (no blur) ✓
  - Tables: horizontal scroll on narrow screen ✓
  - Modals: fit within screen width ✓
