import { ReactNode } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { ForbiddenPage } from './ForbiddenPage';
import { LoginPage } from './LoginPage';

export function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isSupervisor = useAuthStore((s) => s.isSupervisor);

  if (!isAuthenticated) return <LoginPage />;
  if (!isSupervisor) return <ForbiddenPage />;
  return <>{children}</>;
}
