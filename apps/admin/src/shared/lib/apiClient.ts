import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { ACCESS_TOKEN_KEY, API_BASE_URL } from '../../config';
import { useAuthStore } from '../../store/useAuthStore';
import { message } from 'antd';
import {
  extractOperatingModeRestriction,
  operatingModeRestrictionMessage,
} from './operatingModeError';

export const apiClient = axios.create({ baseURL: API_BASE_URL });

apiClient.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {
    // ignore
  }
  return config;
});

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  const state = useAuthStore.getState();
  if (!state.refreshToken || !state.agent) return null;

  try {
    const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {
      refreshToken: state.refreshToken,
    });
    const data = res.data?.data;
    if (data?.accessToken && data?.refreshToken) {
      state.setTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        agent: state.agent,
      });
      return data.accessToken;
    }
  } catch {
    // fall through to clear
  }

  state.clear();
  return null;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // DB 장애 대응 모드의 쓰기 차단은 화면마다 따로 처리하지 않는다. 여기서 한 번
    // 안내하면 기존 설정 화면은 물론 앞으로 추가되는 화면까지 자동으로 덮인다.
    const restricted = extractOperatingModeRestriction(error);
    if (restricted) {
      message.warning(operatingModeRestrictionMessage(restricted));
      return Promise.reject(error);
    }

    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = tryRefresh().finally(() => {
          isRefreshing = false;
        });
      }
      const newAccessToken = await refreshPromise;
      if (newAccessToken) {
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${newAccessToken}`;
        return apiClient.request(original);
      }
    }
    return Promise.reject(error);
  },
);
