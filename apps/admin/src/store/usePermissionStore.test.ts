import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePermissionStore } from './usePermissionStore';

const { apiGet } = vi.hoisted(() => ({
  apiGet: vi.fn(),
}));

vi.mock('../config', () => ({
  API_BASE_URL: 'http://localhost:3000/api/v1',
  ACCESS_TOKEN_KEY: 'kaster.access_token',
  USE_MOCK: false,
}));

vi.mock('../shared/lib/apiClient', () => ({
  apiClient: {
    get: apiGet,
  },
}));

describe('usePermissionStore', () => {
  beforeEach(() => {
    apiGet.mockReset();
    usePermissionStore.setState({
      allowedPaths: ['/dashboard'],
      permissionsByMenu: {},
      loaded: false,
      loading: false,
    });
  });

  it('uses server-provided admin paths without merging every menu back in', async () => {
    apiGet.mockResolvedValue({
      data: {
        data: {
          permissions: [
            {
              menuKey: 'dashboard',
              canView: true,
              canCreate: false,
              canUpdate: false,
              canDelete: false,
              canOperate: false,
              canExport: false,
            },
            {
              menuKey: 'asterisk',
              canView: false,
              canCreate: false,
              canUpdate: false,
              canDelete: false,
              canOperate: false,
              canExport: false,
            },
          ],
        },
      },
    });

    await usePermissionStore.getState().loadForAgent({
      agentId: 'admin-1',
      agentName: 'Admin',
      extension: '2001',
      role: 'admin',
    });

    expect(usePermissionStore.getState().allowedPaths).toEqual(['/dashboard']);
    expect(usePermissionStore.getState().permissionsByMenu.asterisk.canView).toBe(false);
  });
});
