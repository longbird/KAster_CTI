import { ReactNode } from 'react';
import { USE_MOCK } from '../config';
import { useAuthStore } from '../store/useAuthStore';
import { LoginPage } from './LoginPage';

// Mock 모드에서는 로그인 없이 바로 앱 렌더.
// 실제 모드에서는 access token 이 있으면 children, 없으면 LoginPage.
export function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (USE_MOCK) return <>{children}</>;
  if (!isAuthenticated) return <LoginPage />;
  return <>{children}</>;
}
