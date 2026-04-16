import { Card, Col, Divider, Row, Skeleton, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useDashboardData } from '../hooks/useDashboardData';
import { KpiCards } from './KpiCards';
import { TrafficChartCard } from './TrafficChartCard';
import { QueueSummaryTable } from './QueueSummaryTable';
import { TeamStatusTable } from './TeamStatusTable';
import { ActiveCallsTable } from './ActiveCallsTable';
import { AlertsPanel } from './AlertsPanel';
import { InfraStatusBar } from '../../monitoring/components/InfraStatusBar';

export function AdminDashboardPage() {
  const { data, loading } = useDashboardData();

  if (loading) {
    return <Skeleton active paragraph={{ rows: 18 }} />;
  }

  if (!data) {
    return (
      <Card>
        <Typography.Text type="secondary">
          대시보드 데이터를 불러올 수 없습니다. 백엔드 서버 연결을 확인하세요.
        </Typography.Text>
      </Card>
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space align="center" size="middle" wrap>
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>콜센터 운영 대시보드</Typography.Title>
            <Typography.Text type="secondary">
              마지막 갱신 {dayjs(data.updatedAt).format('YYYY-MM-DD HH:mm:ss')}
            </Typography.Text>
          </div>
          <Tag color="blue">/admin/dashboard 기준 UI</Tag>
          <Tag color="geekblue">queue.summary.updated / agent.status.changed / call.updated</Tag>
        </Space>
      </Card>

      <InfraStatusBar />

      <KpiCards items={data.kpis} />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <TrafficChartCard items={data.traffic} />
        </Col>
        <Col xs={24} xl={10}>
          <AlertsPanel items={data.alerts} />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <QueueSummaryTable items={data.queues} />
        </Col>
        <Col xs={24} xl={10}>
          <TeamStatusTable items={data.teams} />
        </Col>
      </Row>

      <ActiveCallsTable items={data.activeCalls} />

      <Card title="운영 메모">
        <Typography.Paragraph>
          이 프로젝트는 mock 데이터 기반으로 바로 실행되는 관리자 대시보드 기준선입니다. 이후 실제 백엔드가 준비되면
          <Typography.Text code>src/features/dashboard/api/dashboardApi.ts</Typography.Text> 만 실제 Axios 호출로 바꾸면 됩니다.
        </Typography.Paragraph>
        <Divider />
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          추천 다음 단계: 인증, 라우트 보호, Axios 계층, WebSocket 실시간 반영, Queue 상세 페이지, 상담원 상세 drawer.
        </Typography.Paragraph>
      </Card>
    </Space>
  );
}
