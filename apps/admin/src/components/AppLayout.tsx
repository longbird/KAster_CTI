import { Button, Layout, Menu, Space, Tag, Typography } from 'antd';
import {
  DashboardOutlined,
  DesktopOutlined,
  LogoutOutlined,
  MonitorOutlined,
  NotificationOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../api/authApi';
import { USE_MOCK } from '../config';
import { useAuthStore } from '../store/useAuthStore';

const { Header, Sider, Content } = Layout;

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const agent = useAuthStore((s) => s.agent);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={240} theme="light" className="app-sider">
        <div className="brand-block">
          <div className="brand-title">CTI Admin</div>
          <div className="brand-subtitle">Asterisk 운영 대시보드</div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={['realtime', 'settings']}
          items={[
            { key: '/dashboard', icon: <DashboardOutlined />, label: '대시보드' },
            {
              key: 'realtime',
              icon: <MonitorOutlined />,
              label: '실시간 운영',
              children: [
                { key: '/live-calls', label: '통화 현황 조회' },
                { key: '/kpi', label: '업무 현황 조회' },
              ],
            },
            {
              key: 'settings',
              icon: <SettingOutlined />,
              label: '운영 설정',
              children: [
                { key: '/settings/agents', label: '상담원 설정' },
                { key: '/settings/queues', label: '호 분배룰 설정' },
              ],
            },
            { key: '/queues', icon: <NotificationOutlined />, label: '큐 현황' },
            { key: '/agents', icon: <TeamOutlined />, label: '상담원 현황' },
            { key: '/monitoring', icon: <DesktopOutlined />, label: '시스템 모니터링' },
            { key: '/asterisk', icon: <SettingOutlined />, label: 'Asterisk 설정' },
          ]}
          onClick={({ key }) => navigate(key as string)}
        />
      </Sider>
      <Layout>
        <Header className="app-header" style={{ justifyContent: 'space-between' }}>
          <Space size="middle" align="center">
            <Typography.Title level={4} style={{ margin: 0 }}>
              관리자 운영 콘솔
            </Typography.Title>
            {USE_MOCK && <Tag color="processing">Mock Feed</Tag>}
          </Space>
          <Space>
            {agent && (
              <Typography.Text type="secondary">
                {agent.agentName} ({agent.role})
              </Typography.Text>
            )}
            <Button icon={<LogoutOutlined />} onClick={logout}>
              로그아웃
            </Button>
          </Space>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
