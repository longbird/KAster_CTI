import { Card, Col, Row, Skeleton, Space, Spin, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useDashboardData } from '../hooks/useDashboardData';
import { KpiCards } from './KpiCards';
import { TrafficChartCard } from './TrafficChartCard';
import { QueueSummaryTable } from './QueueSummaryTable';
import { TeamStatusTable } from './TeamStatusTable';
import { ActiveCallsTable } from './ActiveCallsTable';
import { AlertsPanel } from './AlertsPanel';
import { InfraStatusBar } from '../../monitoring/components/InfraStatusBar';
import { BranchFilterSelect } from '../../../shared/branches/BranchFilterSelect';

export function AdminDashboardPage() {
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const { data, loading, refreshing, error } = useDashboardData(branchId);

  if (loading) {
    return <Skeleton active paragraph={{ rows: 18 }} />;
  }

  if (!data) {
    return (
      <Card>
        <Typography.Text type="secondary">
          {error ?? '대시보드 데이터를 불러올 수 없습니다. 백엔드 서버 연결을 확인하세요.'}
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
          <BranchFilterSelect value={branchId} onChange={setBranchId} />
          <Tag color="blue">/admin/dashboard 기준 UI</Tag>
          <Tag color="geekblue">queue.summary.updated / agent.status.changed / call.updated</Tag>
          {refreshing ? <Spin size="small" /> : null}
          {error ? <Tag color="warning">{error}</Tag> : null}
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
    </Space>
  );
}
