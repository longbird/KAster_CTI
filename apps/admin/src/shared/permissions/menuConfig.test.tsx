import { describe, expect, it } from 'vitest';

import {
  ADMIN_MENU_CONFIG,
  type MenuConfigItem,
  allGroupMenuKeys,
  allLeafMenuKeys,
  filterMenuByAllowedPaths,
  openMenuGroupKeysForPath,
} from './menuConfig';

const BASELINE_LEAF_KEYS = [
  '/agents',
  '/announcements',
  '/asterisk',
  '/blocklist',
  '/customers',
  '/dashboard',
  '/kpi',
  '/live-calls',
  '/monitoring',
  '/opt-out-customers',
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
] as const;

const NESTED_MENU_CONFIG: MenuConfigItem[] = [
  {
    key: 'parent',
    label: 'Parent',
    children: [
      {
        key: 'child',
        label: 'Child',
        children: [{ key: '/deep-leaf', label: 'Deep Leaf' }],
      },
    ],
  },
];

function childKeysOf(groupKey: string) {
  const group = ADMIN_MENU_CONFIG.find((item) => item.key === groupKey);
  return group?.children?.map((child) => child.key) ?? [];
}

describe('ADMIN_MENU_CONFIG', () => {
  it('uses the approved top-level grouping', () => {
    expect(ADMIN_MENU_CONFIG.map((item) => item.key)).toEqual([
      '/dashboard',
      'realtime',
      'reports',
      'settings',
      'customers-group',
    ]);
  });

  it('keeps realtime operational children under the realtime group', () => {
    expect(childKeysOf('realtime')).toEqual([
      '/live-calls',
      '/kpi',
      '/queues',
      '/agents',
      '/monitoring',
    ]);
  });

  it('keeps announcements and system configuration under settings', () => {
    expect(childKeysOf('settings')).toEqual([
      '/settings/branches',
      '/settings/agents',
      '/settings/queues',
      '/settings/forwarding',
      '/settings/prompts',
      '/settings/sms-templates',
      '/settings/permissions',
      '/announcements',
      '/asterisk',
      '/system',
    ]);
  });

  it('groups customer management entries under a non-leaf parent', () => {
    expect(childKeysOf('customers-group')).toEqual(['/customers', '/opt-out-customers', '/blocklist']);
  });

  it('preserves the pre-regrouping leaf key set', () => {
    expect(new Set(allLeafMenuKeys(ADMIN_MENU_CONFIG))).toEqual(new Set(BASELINE_LEAF_KEYS));
  });
});

describe('filterMenuByAllowedPaths', () => {
  it('removes empty groups and preserves matching children', () => {
    const filtered = filterMenuByAllowedPaths(
      ADMIN_MENU_CONFIG,
      new Set(['/dashboard', '/queues', '/customers']),
    );

    expect(filtered.map((item) => item.key)).toEqual(['/dashboard', 'realtime', 'customers-group']);
    expect(filtered.find((item) => item.key === 'realtime')?.children?.map((child) => child.key)).toEqual([
      '/queues',
    ]);
    expect(
      filtered.find((item) => item.key === 'customers-group')?.children?.map((child) => child.key),
    ).toEqual(['/customers']);
  });
});

describe('openMenuGroupKeysForPath', () => {
  it('returns the containing realtime group for operational leaf routes', () => {
    expect(openMenuGroupKeysForPath('/queues')).toEqual(['realtime']);
    expect(openMenuGroupKeysForPath('/agents')).toEqual(['realtime']);
  });

  it('returns the containing settings group for settings leaf routes', () => {
    expect(openMenuGroupKeysForPath('/system')).toEqual(['settings']);
    expect(openMenuGroupKeysForPath('/settings/queues')).toEqual(['settings']);
  });

  it('returns the containing customer group for customer leaf routes', () => {
    expect(openMenuGroupKeysForPath('/customers')).toEqual(['customers-group']);
    expect(openMenuGroupKeysForPath('/opt-out-customers')).toEqual(['customers-group']);
    expect(openMenuGroupKeysForPath('/blocklist')).toEqual(['customers-group']);
  });

  it('returns no parent groups for top-level routes or unknown paths', () => {
    expect(openMenuGroupKeysForPath('/dashboard')).toEqual([]);
    expect(openMenuGroupKeysForPath('/missing')).toEqual([]);
  });

  it('returns the full ancestor chain for nested menu trees', () => {
    expect(openMenuGroupKeysForPath('/deep-leaf', NESTED_MENU_CONFIG)).toEqual(['parent', 'child']);
  });
});

describe('allGroupMenuKeys', () => {
  it('collects visible group keys recursively', () => {
    expect(allGroupMenuKeys(NESTED_MENU_CONFIG)).toEqual(['parent', 'child']);
    expect(allGroupMenuKeys(ADMIN_MENU_CONFIG)).toEqual([
      'realtime',
      'reports',
      'settings',
      'customers-group',
    ]);
  });
});
