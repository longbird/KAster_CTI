import { create } from 'zustand';
import { USE_MOCK } from '../config';
import { apiClient } from '../shared/lib/apiClient';
import { ADMIN_MENU_CONFIG, allLeafMenuKeys, menuKeyToPath } from '../shared/permissions/menuConfig';
import type { AgentInfo } from './useAuthStore';

interface RolePermissionEntry {
  menuKey: string;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canOperate: boolean;
  canExport: boolean;
}

interface PermissionState {
  allowedPaths: string[];
  permissionsByMenu: Record<string, RolePermissionEntry>;
  loaded: boolean;
  loading: boolean;
  loadForAgent: (agent: AgentInfo | null | undefined) => Promise<void>;
  clear: () => void;
}

const ALL_PATHS = allLeafMenuKeys(ADMIN_MENU_CONFIG);

function defaultAllowedPaths(role: string | null | undefined) {
  if (role === 'admin' || role === 'supervisor') {
    return ALL_PATHS;
  }
  return ['/dashboard'];
}

export const usePermissionStore = create<PermissionState>((set) => ({
  allowedPaths: defaultAllowedPaths(null),
  permissionsByMenu: {},
  loaded: USE_MOCK,
  loading: false,
  clear: () =>
    set({
      allowedPaths: defaultAllowedPaths(null),
      permissionsByMenu: {},
      loaded: USE_MOCK,
      loading: false,
    }),
  loadForAgent: async (agent) => {
    const role = agent?.role;
    if (USE_MOCK) {
      set({ allowedPaths: defaultAllowedPaths(role), permissionsByMenu: {}, loaded: true, loading: false });
      return;
    }

    if (!role) {
      set({ allowedPaths: defaultAllowedPaths(role), permissionsByMenu: {}, loaded: false, loading: false });
      return;
    }

    set({ loading: true });
    try {
      const res = await apiClient.get('/admin/settings/permissions/current');
      const data = (res.data?.data ?? {}) as {
        permissions?: RolePermissionEntry[];
      };
      const allowedMenuKeys = data.permissions
        ?.filter((item) => item.canView)
        .map((item) => item.menuKey) ?? [];
      const permissionsByMenu = Object.fromEntries(
        (data.permissions ?? []).map((item) => [item.menuKey, item]),
      );
      const paths = allowedMenuKeys.map(menuKeyToPath);
      set({
        allowedPaths: paths,
        permissionsByMenu,
        loaded: true,
        loading: false,
      });
    } catch {
      set({
        allowedPaths: defaultAllowedPaths(role),
        permissionsByMenu: {},
        loaded: true,
        loading: false,
      });
    }
  },
}));
