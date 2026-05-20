import { defaultPermissionFlags, MENU_KEYS } from './menu-permission.service';

describe('defaultPermissionFlags', () => {
  it('adds sms template management under operations settings permissions', () => {
    expect(MENU_KEYS).toContain('settings/sms-templates');
    expect(defaultPermissionFlags('supervisor', 'settings/sms-templates')).toEqual(
      expect.objectContaining({
        canView: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canExport: true,
      }),
    );
  });

  it('adds customer management permissions with export support', () => {
    expect(MENU_KEYS).toContain('customers');
    expect(defaultPermissionFlags('supervisor', 'customers')).toEqual(
      expect.objectContaining({
        canView: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canOperate: true,
        canExport: true,
      }),
    );
  });

  it('keeps opt-out management as blocklist permission, not customer blacklist submenu', () => {
    expect(MENU_KEYS).toContain('blocklist');
    expect(MENU_KEYS).not.toContain('customers/blacklist');
    expect(defaultPermissionFlags('supervisor', 'blocklist')).toEqual(
      expect.objectContaining({
        canView: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      }),
    );
  });

  it('adds agent group management under operations settings permissions', () => {
    expect(MENU_KEYS).toContain('settings/agent-groups');
    expect(defaultPermissionFlags('supervisor', 'settings/agent-groups')).toEqual(
      expect.objectContaining({
        canView: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      }),
    );
    expect(defaultPermissionFlags('agent', 'settings/agent-groups')).toEqual(
      expect.objectContaining({
        canView: false,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
      }),
    );
  });

  it('adds outbound caller-id rules under operations settings permissions', () => {
    expect(MENU_KEYS).toContain('settings/outbound-rules');
    expect(defaultPermissionFlags('supervisor', 'settings/outbound-rules')).toEqual(
      expect.objectContaining({
        canView: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      }),
    );
  });

  it('adds holiday rules under branch operations settings permissions', () => {
    expect(MENU_KEYS).toContain('settings/holidays');
    expect(defaultPermissionFlags('supervisor', 'settings/holidays')).toEqual(
      expect.objectContaining({
        canView: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      }),
    );
  });

  it('adds supervisor agent monitoring view as an operable view-only menu', () => {
    expect(MENU_KEYS).toContain('monitoring/agents');
    expect(defaultPermissionFlags('supervisor', 'monitoring/agents')).toEqual(
      expect.objectContaining({
        canView: true,
        canOperate: true,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
      }),
    );
    expect(defaultPermissionFlags('agent', 'monitoring/agents')).toEqual(
      expect.objectContaining({
        canView: false,
        canOperate: false,
      }),
    );
  });
});
