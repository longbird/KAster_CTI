import { create } from 'zustand';
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
  loaded: false,
  loading: false,
  clear: () =>
    set({
      allowedPaths: defaultAllowedPaths(null),
      permissionsByMenu: {},
      loaded: false,
      loading: false,
    }),
  loadForAgent: async (agent) => {
    const role = agent?.role;
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
      set({
        allowedPaths: allowedMenuKeys.map(menuKeyToPath),
        permissionsByMenu,
        loaded: true,
        loading: false,
      });
    } catch {
      // fail-closed: 권한 API 장애 시 클라이언트가 임의로 메뉴/액션을 열어주지 않는다.
      // 서버 가드가 최종 방어선이지만 운영 화면에서 권한 fallback 으로 인한
      // 의도치 않은 노출은 금지. 대시보드만 남기고 모든 메뉴를 막는다.
      set({
        allowedPaths: ['/dashboard'],
        permissionsByMenu: {},
        loaded: true,
        loading: false,
      });
    }
  },
}));
