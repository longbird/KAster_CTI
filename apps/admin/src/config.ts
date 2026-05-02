export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:3000/api/v1';
export const WS_BASE_URL =
  (import.meta.env.VITE_WS_URL as string) || API_BASE_URL.replace(/\/api\/v1\/?$/, '');
export const USE_MOCK = (import.meta.env.VITE_USE_MOCK as string) === 'true';
export const ACCESS_TOKEN_KEY = (import.meta.env.VITE_ACCESS_TOKEN_KEY as string) || 'kaster.access_token';
