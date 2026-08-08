# Mobile Sidebar Icon Collapse Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On mobile (< 768px) the sidebar collapses to a 60px icon bar by default; a header toggle expands it to 240px as a fixed overlay with backdrop.

**Architecture:** `AppLayout.tsx` adds `Grid.useBreakpoint()` to detect mobile, a `collapsed` state synced to the breakpoint, and a backdrop element. CSS handles the fixed overlay positioning and toggle button visibility.

**Tech Stack:** React 18, Ant Design 5, TypeScript, CSS

> **Note:** This project has no Jest setup (see CLAUDE.md). Skip test steps. Verify visually in the browser after each task.

---

## Chunk 1: CSS — overlay, backdrop, toggle button, content padding

**Files:**
- Modify: `apps/admin/src/styles.css`

- [ ] **Step 1: Add mobile CSS rules**

Append to the end of `apps/admin/src/styles.css`:

```css
/* Mobile sidebar overlay (expanded state) */
@media (max-width: 767px) {
  .app-sider.sider-overlay {
    position: fixed !important;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 100;
  }
}

/* Backdrop behind expanded mobile sidebar */
.sider-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 99;
}

/* Header toggle button — hidden on desktop, visible on mobile */
.header-menu-toggle {
  display: none;
}

@media (max-width: 767px) {
  .header-menu-toggle {
    display: inline-flex;
  }

  .app-content {
    padding: 12px;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/styles.css
git commit -m "style: add mobile sidebar overlay and toggle button CSS"
```

---

## Chunk 2: AppLayout — breakpoint detection, collapse state, toggle, backdrop

**Files:**
- Modify: `apps/admin/src/components/AppLayout.tsx`

- [ ] **Step 1: Update imports**

Replace the existing `antd` import line:
```ts
// Before
import { Button, Layout, Menu, Result, Space, Spin, Tag, Typography } from 'antd';
```
```ts
// After
import { Button, Grid, Layout, Menu, Result, Space, Spin, Tag, Typography } from 'antd';
```

Replace the existing icons import line:
```ts
// Before
import { LogoutOutlined } from '@ant-design/icons';
```
```ts
// After
import { CloseOutlined, LogoutOutlined, MenuOutlined } from '@ant-design/icons';
```

Replace the existing React import line:
```ts
// Before
import { useEffect, useMemo } from 'react';
```
```ts
// After
import { useEffect, useMemo, useState } from 'react';
```

- [ ] **Step 2: Add breakpoint + collapse state inside the component**

After the `loadForRole` line (around line 26), add:

```ts
const screens = Grid.useBreakpoint();
const isMobile = screens.md === false;
const [collapsed, setCollapsed] = useState(false);
const isExpanded = !collapsed;

useEffect(() => {
  setCollapsed(isMobile);
}, [isMobile]);
```

- [ ] **Step 3: Update Sider JSX**

Replace:
```tsx
      <Sider width={240} theme="light" className="app-sider">
```
With:
```tsx
      <Sider
        width={240}
        collapsedWidth={60}
        collapsed={collapsed}
        theme="light"
        className={`app-sider${isMobile && isExpanded ? ' sider-overlay' : ''}`}
      >
```

- [ ] **Step 4: Pass inlineCollapsed to Menu**

Replace:
```tsx
        <Menu
          mode="inline"
          selectedKeys={[normalizedPath]}
          items={antdMenuItems}
          onClick={({ key }) => navigate(key as string)}
        />
```
With:
```tsx
        <Menu
          mode="inline"
          inlineCollapsed={collapsed}
          selectedKeys={[normalizedPath]}
          items={antdMenuItems}
          onClick={({ key }) => {
            navigate(key as string);
            if (isMobile) setCollapsed(true);
          }}
        />
```

> Closes the sidebar automatically after navigation on mobile.

- [ ] **Step 5: Add toggle button in Header**

After the opening `<Header ...>` tag, before the first `<Space ...>`, add:

```tsx
          <Button
            className="header-menu-toggle"
            type="text"
            icon={isExpanded ? <CloseOutlined /> : <MenuOutlined />}
            onClick={() => setCollapsed((c) => !c)}
            style={{ marginRight: 8 }}
          />
```

So the full Header block looks like:
```tsx
        <Header className="app-header" style={{ justifyContent: 'space-between' }}>
          <Space size="middle" align="center">
            <Button
              className="header-menu-toggle"
              type="text"
              icon={isExpanded ? <CloseOutlined /> : <MenuOutlined />}
              onClick={() => setCollapsed((c) => !c)}
              style={{ marginRight: 8 }}
            />
            <Typography.Title level={4} style={{ margin: 0 }}>
              관리자 운영 콘솔
            </Typography.Title>
            {USE_MOCK && <Tag color="processing">Mock Feed</Tag>}
          </Space>
```

- [ ] **Step 6: Add backdrop before closing `</Layout>`**

After the closing `</Content>` tag and before `</Layout>`:

```tsx
          {isMobile && isExpanded && (
            <div className="sider-backdrop" onClick={() => setCollapsed(true)} />
          )}
```

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/components/AppLayout.tsx
git commit -m "feat: mobile sidebar icon collapse with overlay toggle"
```

---

## Chunk 3: Visual verification checklist

- [ ] **Step 1: Start admin dev server**

```bash
cd apps/admin
npm run dev -- --port 5174
```

Open `http://localhost:5174` in browser.

- [ ] **Step 2: Verify desktop (≥ 768px)**
  - Sidebar shows at full 240px with labels ✓
  - No hamburger button in header ✓
  - No layout shift on page load ✓

- [ ] **Step 3: Verify mobile (< 768px) — use DevTools device toggle**
  - Sidebar defaults to 60px icon-only ✓
  - Ant Design tooltip appears on icon hover/tap ✓
  - Hamburger icon visible in header ✓

- [ ] **Step 4: Verify mobile expand/collapse**
  - Tap hamburger → sidebar expands to 240px as overlay ✓
  - Semi-transparent backdrop covers content ✓
  - Header shows X (close) icon ✓
  - Tap backdrop → sidebar collapses back to 60px ✓
  - Tap X button → collapses ✓
  - Navigate to a menu item → sidebar auto-collapses ✓

- [ ] **Step 5: Verify resize transition**
  - Drag browser window below 768px → sidebar collapses ✓
  - Drag above 768px → sidebar expands, hamburger disappears ✓
  - No flash of wrong state on first render (desktop stays expanded) ✓
