import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../../config';
import { usePlatformAuthStore } from '../store/usePlatformAuthStore';

/**
 * 플랫폼 전용 axios 인스턴스.
 *
 * 기존 `shared/lib/apiClient` 를 쓰지 않는 이유는 그쪽이 테넌트 관리자 토큰을 자동으로 붙이기
 * 때문이다. 플랫폼 API 에 테넌트 토큰이 실려 가면 서버 가드가 거부하고, 반대로 플랫폼 토큰을
 * 그 인스턴스에 밀어 넣으면 관리자 화면 요청까지 오염된다. 두 축을 아예 분리한다.
 */
export const platformApiClient = axios.create({ baseURL: API_BASE_URL });

platformApiClient.interceptors.request.use((config) => {
  const token = usePlatformAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function rotateTokens(): Promise<string | null> {
  const state = usePlatformAuthStore.getState();
  if (!state.refreshToken) return null;

  try {
    const res = await axios.post(`${API_BASE_URL}/platform/auth/refresh`, {
      refreshToken: state.refreshToken,
    });
    const data = res.data?.data;
    if (data?.accessToken && data?.refreshToken) {
      state.setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return data.accessToken as string;
    }
  } catch {
    // 회전이 실패하면 더 시도하지 않고 세션을 버린다. 만료된 refresh 로 계속 두드리면
    // 화면이 401 루프에 빠진다.
  }

  state.clear();
  return null;
}

platformApiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    // 401 은 요청당 딱 한 번만 회전한다. 동시에 여러 요청이 401 을 받아도 회전은 하나로 묶는다.
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      if (!refreshPromise) {
        refreshPromise = rotateTokens().finally(() => {
          refreshPromise = null;
        });
      }
      const nextAccessToken = await refreshPromise;
      if (nextAccessToken) {
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${nextAccessToken}`;
        return platformApiClient.request(original);
      }
    }

    return Promise.reject(error);
  },
);
