import { Layout, Menu, Space, Tag, Typography } from 'antd';
import { DashboardOutlined, NotificationOutlined, TeamOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const { Header, Sider, Content } = Layout;

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();

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
          items={[
            { key: '/dashboard', icon: <DashboardOutlined />, label: '대시보드' },
            { key: '/queues', icon: <NotificationOutlined />, label: '큐 현황' },
            { key: '/agents', icon: <TeamOutlined />, label: '상담원' },
          ]}
          onClick={({ key }) => {
            if (key === '/dashboard') navigate('/dashboard');
          }}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <Space size="middle" align="center">
            <Typography.Title level={4} style={{ margin: 0 }}>관리자 운영 콘솔</Typography.Title>
            <Tag color="processing">실시간 Mock Feed</Tag>
          </Space>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
