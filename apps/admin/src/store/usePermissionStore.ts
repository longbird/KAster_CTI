import { create } from 'zustand';
import { USE_MOCK } from '../config';
import { apiClient } from '../shared/lib/apiClient';
import { ADMIN_MENU_CONFIG, allLeafMenuKeys, menuKeyToPath } from '../shared/permissions/menuConfig';

interface RolePermissionEntry {
  menuKey: string;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canOperate: boolean;
  canExport: boolean;
}

interface RoleMatrixRow {
  roleCode: string;
  permissions: RolePermissionEntry[];
}

interface PermissionPayload {
  matrix: RoleMatrixRow[];
}

interface PermissionState {
  allowedPaths: string[];
  permissionsByMenu: Record<string, RolePermissionEntry>;
  loaded: boolean;
  loading: boolean;
  loadForRole: (role: string | null | undefined) => Promise<void>;
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
  loadForRole: async (role) => {
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
      const res = await apiClient.get('/admin/settings/permissions');
      const data = (res.data?.data ?? {}) as PermissionPayload;
      const row = data.matrix?.find((item) => item.roleCode === role);
      const allowedMenuKeys = row?.permissions
        ?.filter((item) => item.canView)
        .map((item) => item.menuKey) ?? [];
      const permissionsByMenu = Object.fromEntries(
        (row?.permissions ?? []).map((item) => [item.menuKey, item]),
      );
      const paths = allowedMenuKeys.map(menuKeyToPath);
      const merged = role === 'admin' || role === 'supervisor'
        ? Array.from(new Set([...paths, ...ALL_PATHS]))
        : paths;
      set({
        allowedPaths: merged,
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
