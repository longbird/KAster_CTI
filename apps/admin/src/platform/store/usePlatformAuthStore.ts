import { create } from 'zustand';
import type { PlatformAdminIdentity } from '../types/platform';

/**
 * 플랫폼 토큰은 기존 관리자 토큰(`kaster.access_token`)과 **다른 키**를 쓴다.
 * 같은 키를 쓰면 한쪽에서 로그인·로그아웃할 때마다 다른 쪽이 튕겨 나간다 —
 * 운영자가 두 화면을 동시에 열어 두는 것이 정상적인 사용이므로 서로를 밀어내면 안 된다.
 */
export const PLATFORM_ACCESS_TOKEN_KEY = 'kaster.platform_access_token';
export const PLATFORM_REFRESH_TOKEN_KEY = 'kaster.platform_refresh_token';
export const PLATFORM_ADMIN_KEY = 'kaster.platform_admin';

interface PlatformAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  admin: PlatformAdminIdentity | null;
  isAuthenticated: boolean;
  /** 로그인 직후 세션 전체를 세운다. */
  setSession: (params: {
    accessToken: string;
    refreshToken: string;
    admin: PlatformAdminIdentity;
  }) => void;
  /** refresh 회전으로 토큰만 갈아 끼운다. 신원은 그대로 둔다. */
  setTokens: (params: { accessToken: string; refreshToken: string }) => void;
  /** `GET /platform/me` 결과로 신원을 갱신한다 (비밀번호 변경 후 플래그가 내려간다). */
  setAdmin: (admin: PlatformAdminIdentity) => void;
  clear: () => void;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장에 실패해도 이번 세션은 메모리 상태로 계속 쓸 수 있게 둔다.
  }
}

function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function readPersistedAdmin(): PlatformAdminIdentity | null {
  const raw = readStorage(PLATFORM_ADMIN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlatformAdminIdentity;
  } catch {
    return null;
  }
}

export const usePlatformAuthStore = create<PlatformAuthState>((set, get) => {
  const accessToken = readStorage(PLATFORM_ACCESS_TOKEN_KEY);
  const refreshToken = readStorage(PLATFORM_REFRESH_TOKEN_KEY);

  return {
    accessToken,
    refreshToken,
    admin: readPersistedAdmin(),
    isAuthenticated: !!accessToken,

    setSession: ({ accessToken: nextAccess, refreshToken: nextRefresh, admin }) => {
      writeStorage(PLATFORM_ACCESS_TOKEN_KEY, nextAccess);
      writeStorage(PLATFORM_REFRESH_TOKEN_KEY, nextRefresh);
      writeStorage(PLATFORM_ADMIN_KEY, JSON.stringify(admin));
      set({ accessToken: nextAccess, refreshToken: nextRefresh, admin, isAuthenticated: true });
    },

    setTokens: ({ accessToken: nextAccess, refreshToken: nextRefresh }) => {
      writeStorage(PLATFORM_ACCESS_TOKEN_KEY, nextAccess);
      writeStorage(PLATFORM_REFRESH_TOKEN_KEY, nextRefresh);
      set({ accessToken: nextAccess, refreshToken: nextRefresh, isAuthenticated: true });
    },

    setAdmin: (admin) => {
      writeStorage(PLATFORM_ADMIN_KEY, JSON.stringify(admin));
      set({ admin, isAuthenticated: !!get().accessToken });
    },

    clear: () => {
      removeStorage(PLATFORM_ACCESS_TOKEN_KEY);
      removeStorage(PLATFORM_REFRESH_TOKEN_KEY);
      removeStorage(PLATFORM_ADMIN_KEY);
      set({ accessToken: null, refreshToken: null, admin: null, isAuthenticated: false });
    },
  };
});

export function getPlatformAccessToken(): string | null {
  return usePlatformAuthStore.getState().accessToken;
}
