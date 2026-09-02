import { ApartmentOutlined, LogoutOutlined, TeamOutlined } from '@ant-design/icons';
import { Layout, Menu, Space, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ThemeModeSwitch } from '../../components/ThemeModeSwitch';
import { platformLogout } from '../api/platformAuthApi';
import { usePlatformAuthStore } from '../store/usePlatformAuthStore';

const { Header, Content } = Layout;

/**
 * 플랫폼 전용 레이아웃. 관리자 앱의 `AppLayout`(좌측 메뉴 + 메뉴 RBAC)을 쓰지 않는다 —
 * 플랫폼 관리자는 테넌트 메뉴 권한을 갖지 않으므로 그 레이아웃에 태우면 전부 403 으로 보인다.
 */
const MENU_ITEMS: MenuProps['items'] = [
  { key: '/platform', icon: <ApartmentOutlined />, label: '테넌트' },
  { key: '/platform/admins', icon: <TeamOutlined />, label: '플랫폼 관리자' },
];

export function PlatformLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const admin = usePlatformAuthStore((state) => state.admin);

  // 테넌트 상세(/platform/tenants/:id)에서도 '테넌트' 메뉴가 선택된 상태로 남아야 한다.
  const selectedKey = location.pathname.startsWith('/platform/admins') ? '/platform/admins' : '/platform';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header className="app-header" style={{ justifyContent: 'space-between' }}>
        <Space size="large" align="center">
          <Typography.Title level={5} style={{ margin: 0, whiteSpace: 'nowrap' }}>
            플랫폼 콘솔
          </Typography.Title>
          <Menu
            mode="horizontal"
            selectedKeys={[selectedKey]}
            items={MENU_ITEMS}
            style={{ minWidth: 260, borderBottom: 'none', background: 'transparent' }}
            onClick={({ key }) => navigate(key)}
          />
        </Space>
        <Space>
          <ThemeModeSwitch />
          {admin ? (
            <Typography.Text type="secondary" className="header-agent-info">
              {admin.displayName} ({admin.loginId})
            </Typography.Text>
          ) : null}
          <Typography.Link onClick={() => void platformLogout()}>
            <Space size={4}>
              <LogoutOutlined />
              로그아웃
            </Space>
          </Typography.Link>
        </Space>
      </Header>
      <Content className="app-content">
        <Outlet />
      </Content>
    </Layout>
  );
}
