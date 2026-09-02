import axios from 'axios';
import { API_BASE_URL } from '../../config';
import { platformApiClient } from '../lib/platformApiClient';
import { usePlatformAuthStore } from '../store/usePlatformAuthStore';
import type { PlatformAdminIdentity, PlatformLoginResult } from '../types/platform';

/** 로그인은 아직 토큰이 없으므로 인터셉터가 붙은 인스턴스를 쓰지 않는다. */
export async function platformLogin(params: { loginId: string; password: string }) {
  const res = await axios.post(`${API_BASE_URL}/platform/auth/login`, params);
  const data = res.data?.data as PlatformLoginResult | undefined;
  if (!data?.accessToken || !data.admin) {
    throw new Error('플랫폼 로그인 응답이 올바르지 않습니다.');
  }

  usePlatformAuthStore.getState().setSession({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    admin: data.admin,
  });
  return data;
}

export async function platformLogout() {
  const { refreshToken, clear } = usePlatformAuthStore.getState();
  if (refreshToken) {
    try {
      await axios.post(`${API_BASE_URL}/platform/auth/logout`, { refreshToken });
    } catch {
      // 로그아웃은 멱등이다. 서버가 못 받아도 로컬 세션은 반드시 지운다.
    }
  }
  clear();
}

export async function fetchPlatformMe() {
  const res = await platformApiClient.get('/platform/me');
  return res.data?.data as PlatformAdminIdentity;
}

export async function changePlatformPassword(params: { currentPassword: string; newPassword: string }) {
  const res = await platformApiClient.post('/platform/auth/password', params);
  return res.data?.data as { changed: boolean };
}
