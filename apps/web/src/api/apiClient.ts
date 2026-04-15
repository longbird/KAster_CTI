import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../config';
import { getAccessToken, useAuthStore } from '../store/useAuthStore';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

// 간단한 refresh 플로우. 401 이 뜨면 한 번 refresh 시도 후 원래 요청 재시도.
// 순환 방지를 위해 _retry 플래그로 1회만 돌린다.
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  const state = useAuthStore.getState();
  if (!state.refreshToken) return null;
  try {
    const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {
      refreshToken: state.refreshToken,
    });
    const data = res.data?.data;
    if (data?.accessToken && data?.refreshToken) {
      state.setTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        agent: state.agent!,
      });
      return data.accessToken;
    }
  } catch {
    // 실패 시 로그아웃
  }
  state.clear();
  return null;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !original?._retry) {
      original._retry = true;
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = tryRefresh().finally(() => {
          isRefreshing = false;
        });
      }
      const newAccess = await refreshPromise;
      if (newAccess) {
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${newAccess}`;
        return apiClient.request(original);
      }
    }
    return Promise.reject(error);
  },
);
