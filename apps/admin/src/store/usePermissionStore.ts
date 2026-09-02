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
  /** 서버가 판정한 기능 자격. 메뉴가 없는 기능(화면 안의 탭)을 감출 때 쓴다. */
  featureEntitlements: Record<string, boolean>;
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
  featureEntitlements: {},
  loaded: false,
  loading: false,
  clear: () =>
    set({
      allowedPaths: defaultAllowedPaths(null),
      permissionsByMenu: {},
      featureEntitlements: {},
      loaded: false,
      loading: false,
    }),
  loadForAgent: async (agent) => {
    const role = agent?.role;
    if (!role) {
      set({
        allowedPaths: defaultAllowedPaths(role),
        permissionsByMenu: {},
        featureEntitlements: {},
        loaded: false,
        loading: false,
      });
      return;
    }

    set({ loading: true });
    try {
      const res = await apiClient.get('/admin/settings/permissions/current');
      const data = (res.data?.data ?? {}) as {
        permissions?: RolePermissionEntry[];
        featureEntitlements?: Record<string, boolean>;
        hiddenMenuKeys?: string[];
      };
      // 기능 자격이 없으면 권한과 무관하게 메뉴를 감춘다.
      // 어떤 메뉴를 감출지는 서버가 정한다 — 클라이언트가 기능 목록을 스스로 해석하지 않는다.
      const hiddenMenuKeys = new Set(data.hiddenMenuKeys ?? []);
      const allowedMenuKeys = data.permissions
        ?.filter((item) => item.canView && !hiddenMenuKeys.has(item.menuKey))
        .map((item) => item.menuKey) ?? [];
      const permissionsByMenu = Object.fromEntries(
        (data.permissions ?? []).map((item) => [item.menuKey, item]),
      );
      set({
        allowedPaths: allowedMenuKeys.map(menuKeyToPath),
        permissionsByMenu,
        featureEntitlements: data.featureEntitlements ?? {},
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
        featureEntitlements: {},
        loaded: true,
        loading: false,
      });
    }
  },
}));
