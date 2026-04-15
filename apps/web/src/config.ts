export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:3000/api/v1';
export const WS_URL = (import.meta.env.VITE_WS_URL as string) || 'http://localhost:3000';
export const USE_MOCK = (import.meta.env.VITE_USE_MOCK as string) === 'true';
