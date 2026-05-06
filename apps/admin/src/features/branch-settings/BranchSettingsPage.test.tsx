import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { BranchSettingsPage } from './BranchSettingsPage';

vi.mock('../../shared/lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../store/usePermissionStore', () => ({
  usePermissionStore: (selector: (state: unknown) => unknown) =>
    selector({
      permissionsByMenu: {
        'settings/branches': {
          canCreate: true,
          canUpdate: true,
          canDelete: true,
        },
      },
    }),
}));

vi.mock('./BranchEditModal', () => ({
  BranchEditModal: () => null,
}));

describe('BranchSettingsPage layout', () => {
  it('uses the settings portal frame for branch operations', () => {
    const html = renderToStaticMarkup(<BranchSettingsPage />);

    expect(html).toContain('settings-portal');
    expect(html).toContain('settings-portal__summary');
    expect(html).toContain('검증');
    expect(html).toContain('적용');
  });
});
