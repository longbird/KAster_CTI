import { ReactNode } from 'react';
import { USE_MOCK } from '../config';
import { useAuthStore } from '../store/useAuthStore';
import { ForbiddenPage } from './ForbiddenPage';
import { LoginPage } from './LoginPage';

// Mock 모드에서는 로그인/역할 체크 생략. 실 모드에서는 로그인 + supervisor/admin 요구.
export function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isSupervisor = useAuthStore((s) => s.isSupervisor);

  if (USE_MOCK) return <>{children}</>;
  if (!isAuthenticated) return <LoginPage />;
  if (!isSupervisor) return <ForbiddenPage />;
  return <>{children}</>;
}
