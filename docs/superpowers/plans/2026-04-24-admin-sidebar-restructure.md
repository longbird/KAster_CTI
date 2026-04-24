# Admin Sidebar Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 앱 왼쪽 사이드 메뉴를 승인된 기능 중심 구조로 재배치하면서 기존 라우트와 권한 키는 유지한다.

**Architecture:** 메뉴 트리 재구성은 `apps/admin/src/shared/permissions/menuConfig.tsx` 한 곳에 집중한다. 메뉴 구조는 leaf path를 그대로 유지하고 그룹만 이동해 `usePermissionStore`와 `AppLayout`의 기존 권한 필터/렌더링 로직을 그대로 재사용한다. 자동 회귀를 위해 `admin` 앱에 최소 Vitest 설정을 추가해 메뉴 트리 위치와 leaf key 집합을 검증한다.

**Tech Stack:** React 18, Vite 5, TypeScript, Ant Design 5, Zustand, Vitest

---

## File Map

- Modify: `apps/admin/package.json`
  - `test` 스크립트와 최소 테스트 devDependency 추가
- Create: `apps/admin/vitest.config.ts`
  - `menuConfig` 회귀 테스트를 실행할 최소 Vitest 설정
- Modify: `apps/admin/src/shared/permissions/menuConfig.tsx`
  - 승인된 정보구조로 `ADMIN_MENU_CONFIG` 재구성
- Create: `apps/admin/src/shared/permissions/menuConfig.test.tsx`
  - 메뉴 그룹 위치, leaf key 보존, 권한 필터 동작 회귀 검증

## Task 1: Add Minimal Admin Test Harness

**Files:**
- Modify: `apps/admin/package.json`
- Create: `apps/admin/vitest.config.ts`

- [ ] **Step 1: Add a test script and Vitest dependency**

Update `apps/admin/package.json` to add a `test` script and minimal test dependency. Keep existing scripts unchanged.

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
cd apps/admin
npm install
```

Expected: `package-lock.json` updates and `vitest` is installed with no errors.

- [ ] **Step 3: Add Vitest config for pure TSX menu tests**

Create `apps/admin/vitest.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    clearMocks: true,
  },
});
```

- [ ] **Step 4: Verify test runner boots**

Run:

```bash
cd apps/admin
npm test
```

Expected: Vitest starts successfully and reports `No test files found` or equivalent, without config errors.

- [ ] **Step 5: Commit harness setup**

```bash
git add apps/admin/package.json apps/admin/package-lock.json apps/admin/vitest.config.ts
git commit -m "test(admin): add menu config vitest harness"
```

## Task 2: Lock the Approved Sidebar Structure With a Failing Test

**Files:**
- Create: `apps/admin/src/shared/permissions/menuConfig.test.tsx`

- [ ] **Step 1: Write the failing menu regression test**

Create `apps/admin/src/shared/permissions/menuConfig.test.tsx`:

```tsx
import {
  ADMIN_MENU_CONFIG,
  allLeafMenuKeys,
  filterMenuByAllowedPaths,
} from './menuConfig';

function findItem(items: typeof ADMIN_MENU_CONFIG, key: string) {
  for (const item of items) {
    if (item.key === key) return item;
    if (item.children?.length) {
      const hit = findItem(item.children as typeof ADMIN_MENU_CONFIG, key);
      if (hit) return hit;
    }
  }
  return null;
}

describe('ADMIN_MENU_CONFIG sidebar regrouping', () => {
  it('keeps the approved top-level groups in order', () => {
    expect(ADMIN_MENU_CONFIG.map((item) => item.key)).toEqual([
      '/dashboard',
      'realtime',
      'reports',
      'settings',
      'customers-group',
    ]);
  });

  it('moves realtime operational pages under realtime', () => {
    const realtime = findItem(ADMIN_MENU_CONFIG, 'realtime');
    expect(realtime?.children?.map((item) => item.key)).toEqual([
      '/live-calls',
      '/kpi',
      '/queues',
      '/agents',
      '/monitoring',
    ]);
  });

  it('moves announcements, asterisk, and system under settings', () => {
    const settings = findItem(ADMIN_MENU_CONFIG, 'settings');
    expect(settings?.children?.map((item) => item.key)).toContain('/announcements');
    expect(settings?.children?.map((item) => item.key)).toContain('/asterisk');
    expect(settings?.children?.map((item) => item.key)).toContain('/system');
  });

  it('moves blocklist under customer management', () => {
    const customers = findItem(ADMIN_MENU_CONFIG, 'customers-group');
    expect(customers?.children?.map((item) => item.key)).toEqual([
      '/customers',
      '/blocklist',
    ]);
  });

  it('preserves the existing leaf path set used by permissions', () => {
    expect(allLeafMenuKeys(ADMIN_MENU_CONFIG).sort()).toEqual([
      '/agents',
      '/announcements',
      '/asterisk',
      '/blocklist',
      '/customers',
      '/dashboard',
      '/kpi',
      '/live-calls',
      '/monitoring',
      '/queues',
      '/reports/calls',
      '/reports/logs',
      '/reports/missed',
      '/reports/recordings',
      '/settings/agents',
      '/settings/branches',
      '/settings/forwarding',
      '/settings/permissions',
      '/settings/prompts',
      '/settings/queues',
      '/settings/sms-templates',
      '/system',
    ].sort());
  });

  it('drops empty groups after permission filtering', () => {
    const filtered = filterMenuByAllowedPaths(
      ADMIN_MENU_CONFIG,
      new Set(['/dashboard', '/reports/calls']),
    );

    expect(filtered.map((item) => item.key)).toEqual(['/dashboard', 'reports']);
    expect(filtered[1].children?.map((item) => item.key)).toEqual(['/reports/calls']);
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails on current menu structure**

Run:

```bash
cd apps/admin
npm test -- src/shared/permissions/menuConfig.test.tsx
```

Expected: FAIL because the current `ADMIN_MENU_CONFIG` still exposes `/announcements`, `/blocklist`, `/queues`, `/agents`, `/monitoring`, `/asterisk`, and `/system` at the root.

- [ ] **Step 3: Commit the failing test**

```bash
git add apps/admin/src/shared/permissions/menuConfig.test.tsx
git commit -m "test(admin): lock approved sidebar regrouping"
```

## Task 3: Implement the Sidebar Regrouping

**Files:**
- Modify: `apps/admin/src/shared/permissions/menuConfig.tsx`

- [ ] **Step 1: Replace the menu tree with the approved grouped structure**

Update `apps/admin/src/shared/permissions/menuConfig.tsx` so `ADMIN_MENU_CONFIG` becomes:

```tsx
export const ADMIN_MENU_CONFIG: MenuConfigItem[] = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '대시보드' },
  {
    key: 'realtime',
    icon: <MonitorOutlined />,
    label: '실시간 운영',
    children: [
      { key: '/live-calls', label: '통화 현황 조회' },
      { key: '/kpi', label: '업무 현황 조회' },
      { key: '/queues', label: '큐 현황' },
      { key: '/agents', label: '상담원 현황' },
      { key: '/monitoring', label: '시스템 모니터링' },
    ],
  },
  {
    key: 'reports',
    icon: <FileTextOutlined />,
    label: '보고서',
    children: [
      { key: '/reports/calls', label: '통화내역 (CDR)' },
      { key: '/reports/missed', label: '미연결 콜' },
      { key: '/reports/recordings', label: '녹취 목록' },
      { key: '/reports/logs', label: '호 로그' },
    ],
  },
  {
    key: 'settings',
    icon: <SettingOutlined />,
    label: '운영 설정',
    children: [
      { key: '/settings/branches', label: '지사 관리' },
      { key: '/settings/agents', label: '상담원 설정' },
      { key: '/settings/queues', label: '호 분배룰 설정' },
      { key: '/settings/forwarding', label: '착신전환 설정' },
      { key: '/settings/prompts', label: '멘트 관리' },
      { key: '/settings/sms-templates', label: '문자 템플릿 관리' },
      { key: '/settings/permissions', label: '권한 관리' },
      { key: '/announcements', label: '공지사항' },
      { key: '/asterisk', label: '연동 설정' },
      { key: '/system', label: '시스템 설정' },
    ],
  },
  {
    key: 'customers-group',
    icon: <TeamOutlined />,
    label: '고객 관리',
    children: [
      { key: '/customers', label: '고객 관리' },
      { key: '/blocklist', icon: <PhoneOutlined />, label: '블랙리스트 관리' },
    ],
  },
];
```

Implementation notes:

- Remove the old root-level entries for `/announcements`, `/blocklist`, `/queues`, `/agents`, `/monitoring`, `/asterisk`, and `/system`.
- Keep every existing leaf path string unchanged.
- Use a group key like `customers-group` instead of `/customers` for the parent so the leaf `/customers` remains a clickable child page.

- [ ] **Step 2: Run the regression test and confirm it passes**

Run:

```bash
cd apps/admin
npm test -- src/shared/permissions/menuConfig.test.tsx
```

Expected: PASS for all menu regrouping assertions.

- [ ] **Step 3: Run the admin production build**

Run:

```bash
cd apps/admin
npm run build
```

Expected: successful TypeScript + Vite build. Chunk-size warnings are acceptable; build failure is not.

- [ ] **Step 4: Commit the implementation**

```bash
git add apps/admin/src/shared/permissions/menuConfig.tsx
git commit -m "feat(admin): regroup sidebar navigation by function"
```

## Task 4: Runtime Verification

**Files:**
- No code changes required unless verification exposes a rendering defect

- [ ] **Step 1: Verify grouped rendering in local or deployed admin UI**

Check the left sidebar visually and confirm the exact grouping:

- `대시보드`
- `실시간 운영`
- `보고서`
- `운영 설정`
- `고객 관리`

Expected:

- `공지사항` appears under `운영 설정`
- `블랙리스트 관리` appears under `고객 관리`
- `큐 현황`, `상담원 현황`, `시스템 모니터링` appear under `실시간 운영`
- `연동 설정`, `시스템 설정` appear under `운영 설정`

- [ ] **Step 2: Verify navigation from each moved menu item**

Manually click these moved items:

- `공지사항`
- `블랙리스트 관리`
- `큐 현황`
- `상담원 현황`
- `시스템 모니터링`
- `연동 설정`
- `시스템 설정`

Expected:

- Each click routes to the same page as before
- No 403 permission page for a `supervisor` user
- Mobile overlay menu still collapses after navigation

- [ ] **Step 3: Commit only if runtime fixes were needed**

If verification exposed no code defects, do nothing.

If a fix was needed, commit it separately:

```bash
git add <fixed-files>
git commit -m "fix(admin): correct sidebar regrouping regression"
```

## Spec Coverage Check

- Approved top-level regrouping: covered by Task 2 tests and Task 3 implementation
- `공지사항 -> 운영 설정`: covered by Task 2 and Task 3
- `블랙리스트 관리 -> 고객 관리`: covered by Task 2 and Task 3
- `큐 현황`, `상담원 현황`, `시스템 모니터링` regrouping: covered by Task 2 and Task 3
- `연동 설정`, `시스템 설정` regrouping: covered by Task 2 and Task 3
- Route and permission-key preservation: covered by the leaf-path regression test and implementation notes

## Self-Review

- No `TBD`, `TODO`, or placeholder tasks remain.
- All spec requirements map to at least one task.
- The plan keeps implementation scope aligned with the approved design by changing the menu definition only, plus minimal test harness support.

