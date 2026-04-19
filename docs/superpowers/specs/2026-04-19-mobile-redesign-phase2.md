# Mobile Redesign Phase 2 — Spec

## Problems
1. **apps/web**: SideNav is `w-64 fixed`, main has `ml-64` hardcoded — no mobile handling
2. **apps/admin header**: `rgba(255,255,255,0.88)` + `backdrop-filter:blur` — poor contrast on mobile
3. **apps/admin detail pages**: 25+ tables have no horizontal scroll; modals have fixed px widths (e.g. 1080px)

## Solution Overview

### Issue 1 — apps/web: Bottom Tab Bar (mobile only)

**Breakpoint**: `md` (768px). Below = mobile, above = desktop (unchanged).

**New file:** `apps/web/src/components/BottomTabBar.tsx`
- Fixed bottom bar, height 56px (`h-14`)
- 4 tabs: 개요 (dashboard), 콜센터 (headset_mic), 큐 (stacked_line_chart), 이력 (history)
- Uses existing `useUiStore` `fullSection` / `setFullSection`
- `md:hidden` — invisible on desktop
- Active tab: `text-primary` + border-top indicator

**Modified:** `apps/web/src/components/SideNav.tsx`
- Add `hidden md:flex` to the root `<aside>` element

**Modified:** `apps/web/src/layout/FullShell.tsx`
- `main` class: `ml-64 min-h-screen p-8 pt-24` → `md:ml-64 min-h-screen p-4 pt-20 pb-20 md:p-8 md:pt-24 md:pb-0`
- Add `<BottomTabBar />` as last child inside root div (before closing `</div>`)

**Modified:** `apps/web/src/components/TopAppBar.tsx`
- `px-8` → `px-4 md:px-8`
- `gap-6` (left section) → `gap-2 md:gap-6`
- `gap-4` (right section) → `gap-2 md:gap-4`
- Agent avatar + name block: add `hidden md:flex` (hide on mobile — saves space)

### Issue 2 — apps/admin: Header solid background on mobile

**Modified:** `apps/admin/src/styles.css`

Add to existing mobile media query (`@media (max-width: 767px)`):
```css
.app-header {
  background: rgba(255, 255, 255, 1);
  backdrop-filter: none;
}
```

### Issue 3 — apps/admin: Tables + Modals mobile

**Modified:** `apps/admin/src/styles.css`

Add new rules:
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

This avoids modifying 25+ individual table/modal files.

## Files Changed Summary

| File | Change |
|------|--------|
| NEW `apps/web/src/components/BottomTabBar.tsx` | Mobile bottom tab nav |
| `apps/web/src/components/SideNav.tsx` | Add `hidden md:flex` |
| `apps/web/src/layout/FullShell.tsx` | `md:ml-64`, bottom padding, add `<BottomTabBar />` |
| `apps/web/src/components/TopAppBar.tsx` | Tighten padding/gap, hide agent block on mobile |
| `apps/admin/src/styles.css` | Header solid bg + table scroll + modal clamp |

## Out of Scope
- Per-page responsive layout overhauls (column stacking, form layout) — separate task
- apps/web MiniShell — already a compact card, no changes needed
- apps/admin page-by-page redesign beyond table scroll and modal width
