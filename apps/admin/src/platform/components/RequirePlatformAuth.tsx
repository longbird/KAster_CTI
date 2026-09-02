import { Spin } from 'antd';
import { type ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { fetchPlatformMe } from '../api/platformAuthApi';
import { PlatformPasswordChangePage } from '../PlatformPasswordChangePage';
import { usePlatformAuthStore } from '../store/usePlatformAuthStore';

/**
 * 플랫폼 화면의 문지기.
 *
 * 세 갈래다. 토큰이 없으면 로그인으로 보내고, `mustChangePassword` 면 비밀번호 변경 폼만
 * 띄우며(메뉴조차 주지 않는다), 그 외에만 실제 화면을 연다.
 */
export function RequirePlatformAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = usePlatformAuthStore((state) => state.isAuthenticated);
  const admin = usePlatformAuthStore((state) => state.admin);
  const setAdmin = usePlatformAuthStore((state) => state.setAdmin);
  const clear = usePlatformAuthStore((state) => state.clear);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setChecked(true);
      return;
    }

    let cancelled = false;
    // localStorage 에 남은 토큰은 이미 만료됐을 수 있고, 저장된 mustChangePassword 도
    // 다른 창에서 바꾼 뒤라면 낡았다. 진입할 때 한 번 서버에 확인한다.
    void fetchPlatformMe()
      .then((identity) => {
        if (!cancelled) setAdmin(identity);
      })
      .catch(() => {
        if (!cancelled) clear();
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });

    return () => {
      cancelled = true;
    };
    // 토큰이 새로 생긴 순간(로그인 직후)에만 다시 확인한다.
  }, [isAuthenticated, setAdmin, clear]);

  if (!isAuthenticated) return <Navigate to="/platform/login" replace />;

  if (!checked && !admin) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (admin?.mustChangePassword) return <PlatformPasswordChangePage />;

  return <>{children}</>;
}
