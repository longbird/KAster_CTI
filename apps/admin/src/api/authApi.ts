import axios from 'axios';
import { API_BASE_URL } from '../config';
import { useAuthStore } from '../store/useAuthStore';

export async function login(params: { loginId: string; password: string; extension: string }) {
  const res = await axios.post(`${API_BASE_URL}/auth/login`, params);
  const data = res.data?.data;
  if (!data?.accessToken) {
    throw new Error('Invalid login response');
  }
  useAuthStore.getState().setTokens({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    agent: data.agent,
  });
  return data;
}

export async function logout() {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (refreshToken) {
    try {
      await axios.post(`${API_BASE_URL}/auth/logout`, { refreshToken });
    } catch {
      // 멱등
    }
  }
  useAuthStore.getState().clear();
}
