import { Button, Grid, Layout, Menu, Result, Space, Spin, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { CloseOutlined, LogoutOutlined, MenuOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { logout } from '../api/authApi';
import { USE_MOCK } from '../config';
import brandImage from '../assets/kaster-admin-brand.webp';
import { useAuthStore } from '../store/useAuthStore';
import { usePermissionStore } from '../store/usePermissionStore';
import {
  ADMIN_MENU_CONFIG,
  filterMenuByAllowedPaths,
  openMenuGroupKeysForPath,
  pathToMenuKey,
} from '../shared/permissions/menuConfig';

const { Header, Sider, Content } = Layout;

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

  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768);
  const showOverlay = isMobile && !collapsed;

  useEffect(() => {
    if (screens.md !== undefined) {
      setCollapsed(isMobile);
    }
  }, [isMobile]);

  const allowedPathSet = useMemo(() => new Set(allowedPaths), [allowedPaths]);
  const menuItems = useMemo(
    () => filterMenuByAllowedPaths(ADMIN_MENU_CONFIG, allowedPathSet),
    [allowedPathSet],
  );
  const antdMenuItems = menuItems as MenuProps['items'];

  const pathname = location.pathname || '/dashboard';
  const normalizedPath = pathname === '/' ? '/dashboard' : pathname;
  const canonicalPath = normalizedPath === '/integrations' ? '/asterisk' : normalizedPath;
  const isAllowed = USE_MOCK || allowedPathSet.has(canonicalPath);
  const activeGroupKeys = useMemo(() => openMenuGroupKeysForPath(canonicalPath), [canonicalPath]);
  const visibleGroupKeys = useMemo(
    () => new Set(menuItems.filter((item) => item.children?.length).map((item) => item.key)),
    [menuItems],
  );
  const [userOpenKeys, setUserOpenKeys] = useState<string[]>([]);
  const openKeys = useMemo(
    () =>
      Array.from(new Set([...activeGroupKeys, ...userOpenKeys])).filter((key) => visibleGroupKeys.has(key)),
    [activeGroupKeys, userOpenKeys, visibleGroupKeys],
  );

  useEffect(() => {
    setUserOpenKeys((current) => {
      const next = current.filter((key) => visibleGroupKeys.has(key));
      return next.length === current.length && next.every((key, index) => key === current[index])
        ? current
        : next;
    });
  }, [visibleGroupKeys]);

  if (!USE_MOCK && (!loaded || loading)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={240}
        collapsedWidth={60}
        collapsed={collapsed}
        theme="light"
        className={`app-sider${showOverlay ? ' sider-overlay' : ''}`}
        >
        <div className={`brand-block${collapsed ? ' brand-block--collapsed' : ''}`}>
          <img src={brandImage} alt="KAster Admin" className="brand-mark" />
          {!collapsed ? (
            <div className="brand-copy">
              <div className="brand-title">CTI Admin</div>
              <div className="brand-subtitle">PBX 운영 대시보드</div>
            </div>
          ) : null}
        </div>
        <div className="app-sider-menu">
          <Menu
            mode="inline"
            inlineCollapsed={collapsed}
            selectedKeys={[canonicalPath]}
            openKeys={collapsed ? [] : openKeys}
            items={antdMenuItems}
            onOpenChange={(nextOpenKeys) => setUserOpenKeys(nextOpenKeys as string[])}
            onClick={({ key }) => {
              navigate(key as string);
              if (isMobile) setCollapsed(true);
            }}
          />
        </div>
      </Sider>
      <Layout className="app-main-layout">
        <Header className="app-header" style={{ justifyContent: 'space-between' }}>
          <Space size="middle" align="center">
            <Button
              className="header-menu-toggle"
              type="text"
              icon={!collapsed ? <CloseOutlined /> : <MenuOutlined />}
              onClick={() => setCollapsed((c) => !c)}
              style={{ marginRight: 8 }}
            />
            <Typography.Title level={4} style={{ margin: 0 }}>
              관리자 운영 콘솔
            </Typography.Title>
            {USE_MOCK && <Tag color="processing">Mock Feed</Tag>}
          </Space>
          <Space>
            {agent && (
              <Typography.Text type="secondary" className="header-agent-info">
                {agent.agentName} ({agent.role})
              </Typography.Text>
            )}
            <Button icon={<LogoutOutlined />} onClick={logout}>
              로그아웃
            </Button>
          </Space>
        </Header>
        <Content className="app-content">
          {isAllowed ? (
            <Outlet />
          ) : (
            <Result
              status="403"
              title="메뉴 접근 권한 없음"
              subTitle={`${pathToMenuKey(canonicalPath)} 메뉴는 현재 역할에 허용되지 않았습니다.`}
            />
          )}
        </Content>
      </Layout>
      {showOverlay && <div className="sider-backdrop" onClick={() => setCollapsed(true)} />}
    </Layout>
  );
}
