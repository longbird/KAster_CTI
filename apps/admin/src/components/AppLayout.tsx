import { Button, Grid, Layout, List, Menu, Modal, Result, Space, Spin, Tag, Typography, message } from 'antd';
import type { MenuProps } from 'antd';
import { CloseOutlined, LogoutOutlined, MenuOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { logout } from '../api/authApi';
import brandImage from '../assets/kaster-admin-brand.webp';
import { useAuthStore } from '../store/useAuthStore';
import { usePermissionStore } from '../store/usePermissionStore';
import { ThemeModeSwitch } from './ThemeModeSwitch';
import { apiClient } from '../shared/lib/apiClient';
import {
  ADMIN_MENU_CONFIG,
  allGroupMenuKeys,
  filterMenuByAllowedPaths,
  openMenuGroupKeysForPath,
  pathToMenuKey,
} from '../shared/permissions/menuConfig';

const { Header, Sider, Content } = Layout;

interface LoginUpdateNotice {
  announcementId: string;
  title: string;
  body: string;
  severity?: 'INFO' | 'IMPORTANT' | 'CRITICAL';
  releaseTag?: string | null;
  createdAt: string;
}

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const agent = useAuthStore((s) => s.agent);
  const allowedPaths = usePermissionStore((s) => s.allowedPaths);
  const loaded = usePermissionStore((s) => s.loaded);
  const loading = usePermissionStore((s) => s.loading);
  const loadForAgent = usePermissionStore((s) => s.loadForAgent);
  const [loginUpdates, setLoginUpdates] = useState<LoginUpdateNotice[]>([]);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [acknowledgingUpdates, setAcknowledgingUpdates] = useState(false);
  const [checkedUpdateAgentId, setCheckedUpdateAgentId] = useState<string | null>(null);

  useEffect(() => {
    void loadForAgent(agent);
  }, [agent, loadForAgent]);

  useEffect(() => {
    if (!loaded || loading || !agent?.agentId || checkedUpdateAgentId === agent.agentId) return;
    setCheckedUpdateAgentId(agent.agentId);
    void apiClient
      .get('/admin/announcements/login-updates')
      .then((res) => {
        const rows = res.data?.data ?? [];
        setLoginUpdates(rows);
        setUpdateModalOpen(rows.length > 0);
      })
      .catch(() => {
        setLoginUpdates([]);
      });
  }, [agent?.agentId, checkedUpdateAgentId, loaded, loading]);

  const acknowledgeLoginUpdates = async () => {
    setAcknowledgingUpdates(true);
    try {
      await Promise.all(
        loginUpdates.map((item) => apiClient.post(`/admin/announcements/${item.announcementId}/read`)),
      );
      setUpdateModalOpen(false);
      setLoginUpdates([]);
    } catch {
      message.error('업데이트 확인 처리에 실패했습니다.');
    } finally {
      setAcknowledgingUpdates(false);
    }
  };

  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768);
  const showOverlay = isMobile && !collapsed;

  useEffect(() => {
    if (screens.md !== undefined) {
      setCollapsed(isMobile);
    }
  }, [screens.md, isMobile]);

  const allowedPathSet = useMemo(() => new Set(allowedPaths), [allowedPaths]);
  const menuItems = useMemo(
    () => filterMenuByAllowedPaths(ADMIN_MENU_CONFIG, allowedPathSet),
    [allowedPathSet],
  );
  const antdMenuItems = menuItems as MenuProps['items'];

  const pathname = location.pathname || '/dashboard';
  const normalizedPath = pathname === '/' ? '/dashboard' : pathname;
  const activePath = normalizedPath;
  const isAllowed = allowedPathSet.has(activePath);
  const activeGroupKeys = useMemo(() => openMenuGroupKeysForPath(activePath), [activePath]);
  const visibleGroupKeys = useMemo(
    () => new Set(allGroupMenuKeys(menuItems)),
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

  if (!loaded || loading) {
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
        collapsedWidth={isMobile ? 0 : 60}
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
            selectedKeys={[activePath]}
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
          </Space>
          <Space>
            <ThemeModeSwitch />
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
              subTitle={`${pathToMenuKey(activePath)} 메뉴는 현재 역할에 허용되지 않았습니다.`}
            />
          )}
        </Content>
      </Layout>
      {showOverlay && <div className="sider-backdrop" onClick={() => setCollapsed(true)} />}
      <Modal
        title="업데이트 내역"
        open={updateModalOpen}
        onOk={() => void acknowledgeLoginUpdates()}
        okText="확인"
        cancelButtonProps={{ style: { display: 'none' } }}
        closable={false}
        maskClosable={false}
        confirmLoading={acknowledgingUpdates}
      >
        <List
          dataSource={loginUpdates}
          renderItem={(item) => {
            const color = item.severity === 'CRITICAL' ? 'red' : item.severity === 'IMPORTANT' ? 'orange' : 'blue';
            const label = item.severity === 'CRITICAL' ? '긴급' : item.severity === 'IMPORTANT' ? '중요' : '일반';
            return (
              <List.Item>
                <List.Item.Meta
                  title={(
                    <Space wrap>
                      <Typography.Text strong>{item.title}</Typography.Text>
                      <Tag color={color}>{label}</Tag>
                      {item.releaseTag ? <Tag>{item.releaseTag}</Tag> : null}
                    </Space>
                  )}
                  description={(
                    <Space direction="vertical" size={4}>
                      <Typography.Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                        {item.body}
                      </Typography.Paragraph>
                      <Typography.Text type="secondary">
                        {dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')}
                      </Typography.Text>
                    </Space>
                  )}
                />
              </List.Item>
            );
          }}
        />
      </Modal>
    </Layout>
  );
}
