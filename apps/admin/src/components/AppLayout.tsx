import { Button, Layout, Menu, Space, Tag, Typography } from 'antd';
import {
  DashboardOutlined,
  DesktopOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MonitorOutlined,
  NotificationOutlined,
  PhoneOutlined,
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
          defaultOpenKeys={['realtime', 'reports', 'settings']}
          items={[
            { key: '/dashboard', icon: <DashboardOutlined />, label: '대시보드' },
            {
              key: 'realtime',
              icon: <MonitorOutlined />,
              label: '실시간 운영',
              children: [
                { key: '/live-calls', label: '통화 현황 조회' },
                { key: '/kpi',        label: '업무 현황 조회' },
              ],
            },
            {
              key: 'reports',
              icon: <FileTextOutlined />,
              label: '보고서',
              children: [
                { key: '/reports/calls',       label: '통화내역 (CDR)' },
                { key: '/reports/missed',      label: '미연결 콜' },
                { key: '/reports/recordings',  label: '녹취 목록' },
                { key: '/reports/logs',        label: '호 로그' },
              ],
            },
            {
              key: 'settings',
              icon: <SettingOutlined />,
              label: '운영 설정',
              children: [
                { key: '/settings/agents',      label: '상담원 설정' },
                { key: '/settings/queues',      label: '호 분배룰 설정' },
                { key: '/settings/forwarding',  label: '착신전환 설정' },
                { key: '/settings/prompts',     label: '멘트 관리' },
                { key: '/settings/branches',    label: '지사 관리' },
                { key: '/settings/permissions', label: '권한 관리' },
              ],
            },
            { key: '/announcements', icon: <NotificationOutlined />, label: '공지사항' },
            { key: '/blocklist',     icon: <PhoneOutlined />,        label: '080 수신거부' },
            { key: '/system',        icon: <DesktopOutlined />,      label: '시스템 설정' },
            { key: '/queues',        icon: <NotificationOutlined />, label: '큐 현황' },
            { key: '/agents',        icon: <TeamOutlined />,         label: '상담원 현황' },
            { key: '/monitoring',    icon: <DesktopOutlined />,      label: '시스템 모니터링' },
            { key: '/asterisk',      icon: <SettingOutlined />,      label: 'Asterisk 설정' },
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
