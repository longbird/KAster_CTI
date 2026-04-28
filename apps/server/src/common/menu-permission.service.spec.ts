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

  it('adds customer-selected opt-out customers as a separate customer menu', () => {
    expect(MENU_KEYS).toContain('opt-out-customers');
    expect(defaultPermissionFlags('supervisor', 'opt-out-customers')).toEqual(
      expect.objectContaining({
        canView: true,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
      }),
    );
  });

  it('keeps manual blacklist management as blocklist permission, not customer blacklist submenu', () => {
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
});
