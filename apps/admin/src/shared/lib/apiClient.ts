import axios from 'axios';
import { ACCESS_TOKEN_KEY, API_BASE_URL } from '../../config';

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
