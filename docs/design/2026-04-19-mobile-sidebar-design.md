# Mobile Sidebar — Icon Collapse Design

## Problem
The admin app's `AppLayout` renders a fixed 240px `Sider` with no responsive handling. On mobile screens the sidebar consumes too much horizontal space, leaving inadequate room for content.

## Solution
Implement breakpoint-driven sidebar collapse: on mobile (< 768px) the sidebar defaults to a 60px icon-only bar; tapping a toggle expands it to 240px as a fixed overlay with a semi-transparent backdrop.

## Behaviour

| Context | State | Width | Layout |
|---------|-------|-------|--------|
| Desktop (≥ 768px) | Always expanded | 240px | Inline (pushes content) |
| Mobile (< 768px) | Default collapsed | 60px | Inline (icon-only) |
| Mobile (< 768px) | User-expanded | 240px | Fixed overlay + backdrop |

## Toggle
- A `MenuOutlined` / `CloseOutlined` button appears in the header **only on mobile**.
- Clicking it toggles `collapsed` state.
- Switching from mobile → desktop automatically resets to expanded (via `useBreakpoint`).

## Ant Design APIs Used
- `Grid.useBreakpoint()` — detects `md` breakpoint
- `Sider` props: `collapsed`, `collapsedWidth={60}`, `width={240}`
- `Menu` prop: `inlineCollapsed={collapsed}` — Ant Design auto-shows icon tooltips when collapsed

## Files Changed

### `apps/admin/src/components/AppLayout.tsx`
1. Import `Grid` from `antd`, `MenuOutlined` / `CloseOutlined` from icons
2. Add `const screens = Grid.useBreakpoint()` and `const isMobile = screens.md === false` (guard against `undefined` on first render — avoids flash-collapsed on desktop)
3. Add `const [collapsed, setCollapsed] = useState(false)`
4. `useEffect([isMobile])` — set `collapsed(true)` when `isMobile` becomes true, `collapsed(false)` when false. This also handles portrait↔landscape transitions implicitly.
5. Derive `const isExpanded = !collapsed` for readability
6. Pass `collapsed` / `collapsedWidth={60}` to `Sider`; add class `sider-overlay` when `isMobile && isExpanded`
7. Pass `inlineCollapsed={collapsed}` to `Menu`
8. Add hamburger toggle button (`className="header-menu-toggle"`) in `Header` — visible only on mobile
9. Render `<div className="sider-backdrop">` when `isMobile && isExpanded`; clicking it collapses sidebar

### `apps/admin/src/styles.css`
1. Mobile overlay rule: `.app-sider.sider-overlay` → `position: fixed; top: 0; left: 0; bottom: 0; z-index: 100` (below Ant Design modal z-index 1000)
2. Backdrop rule: `.sider-backdrop` — `position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 99`
3. Header toggle button: `.header-menu-toggle { display: none }` + `@media (max-width: 767px) { .header-menu-toggle { display: inline-flex } }`
4. Reduce content padding on mobile: `@media (max-width: 767px) { .app-content { padding: 12px } }`

## Z-index Stacking
- Sider overlay: 100, Backdrop: 99 — Ant Design Modal/Drawer starts at 1000, so modals correctly appear above the expanded sidebar.

## Out of Scope
- Per-page responsive layout fixes (tables, cards) — separate task
- Desktop sidebar toggle — not requested
