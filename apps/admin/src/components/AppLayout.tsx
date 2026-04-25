import { Menu, Result, Spin } from 'antd';
import type { MenuProps } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo } from 'react';
import { logout } from '../api/authApi';
import { USE_MOCK } from '../config';
import { useAuthStore } from '../store/useAuthStore';
import { usePermissionStore } from '../store/usePermissionStore';
import {
  ADMIN_MENU_CONFIG,
  filterMenuByAllowedPaths,
  pathToMenuKey,
} from '../shared/permissions/menuConfig';

// v2 Operator — adm-app shell (top / side / main / status). Side uses Antd Menu
// to preserve existing grouped navigation + permissions, re-skinned via .ant-menu
// overrides in styles.css.
export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const agent = useAuthStore((s) => s.agent);
  const allowedPaths = usePermissionStore((s) => s.allowedPaths);
  const loaded = usePermissionStore((s) => s.loaded);
  const loading = usePermissionStore((s) => s.loading);
  const loadForAgent = usePermissionStore((s) => s.loadForAgent);

  useEffect(() => {
    void loadForAgent(agent);
  }, [agent, loadForAgent]);

  const allowedPathSet = useMemo(() => new Set(allowedPaths), [allowedPaths]);
  const menuItems = useMemo(
    () => filterMenuByAllowedPaths(ADMIN_MENU_CONFIG, allowedPathSet),
    [allowedPathSet],
  );
  const antdMenuItems = menuItems as MenuProps['items'];

  const pathname = location.pathname || '/dashboard';
  const normalizedPath = pathname === '/' ? '/dashboard' : pathname;
  const isAllowed = USE_MOCK || allowedPathSet.has(normalizedPath);

  if (!USE_MOCK && (!loaded || loading)) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-0)',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  const role = (agent?.role ?? 'admin').toUpperCase();
  const initial = agent?.agentName?.charAt(0) ?? '관';
  const now = new Date().toLocaleTimeString('ko-KR', { hour12: false });

  return (
    <div className="adm-app">
      <div className="adm-top">
        <div className="adm-brand">
          <div className="adm-brand-box">K</div>
          <div className="adm-brand-wm">
            KASTER<span> / CTI</span>
            <em>ADMIN</em>
          </div>
        </div>
        <div className="adm-top-meta">
          <span className="seg">
            <span
              className="k-dot k-dot-live"
              style={{ background: 'var(--signal)', width: 6, height: 6 }}
            />
            <strong>{USE_MOCK ? 'MOCK' : 'AMI'}</strong> CONNECTED
          </span>
          <span className="sep" />
          <span className="seg">
            <strong>tenant</strong> kaster-prod
          </span>
        </div>
        <div className="adm-top-right">
          <div className="adm-admin-pill">
            <div className="adm-avatar" style={{ width: 18, height: 18 }}>
              {initial}
            </div>
            <span>{agent?.agentName ?? '관리자'}</span>
            <span className="role">{role}</span>
          </div>
          <button
            type="button"
            className="k-btn k-btn-sm k-btn-danger"
            onClick={() => {
              void logout();
            }}
          >
            로그아웃
          </button>
        </div>
      </div>

      <aside className="adm-side">
        <Menu
          mode="inline"
          selectedKeys={[normalizedPath]}
          items={antdMenuItems}
          onClick={({ key }) => navigate(key as string)}
          style={{ background: 'transparent', borderRight: 0 }}
        />
      </aside>

      <main className="adm-main">
        <div className="adm-main-inner">
          {isAllowed ? (
            <Outlet />
          ) : (
            <Result
              status="403"
              title="메뉴 접근 권한 없음"
              subTitle={`${pathToMenuKey(normalizedPath)} 메뉴는 현재 역할에 허용되지 않았습니다.`}
            />
          )}
        </div>
      </main>

      <footer className="adm-status">
        <span className="seg">
          <span
            className="k-dot k-dot-live"
            style={{ background: 'var(--signal)', width: 6, height: 6 }}
          />
          <strong>WS</strong> 12ms
        </span>
        <span className="seg">
          <strong>DB</strong> OK
        </span>
        <span className="seg">
          <strong>API</strong> {USE_MOCK ? 'MOCK' : 'LIVE'}
        </span>
        <span className="spacer" />
        <span>build 2.0.0 · {now}</span>
      </footer>
    </div>
  );
}
