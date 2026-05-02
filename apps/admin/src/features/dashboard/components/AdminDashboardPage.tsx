import { Card, Col, Row, Skeleton, Space, Spin, Typography } from 'antd';
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
      <div className="adm-page-head">
        <div>
          <h1 className="adm-page-title">콜센터 운영 대시보드</h1>
          <div className="adm-page-sub">
            {dayjs(data.updatedAt).format('YYYY-MM-DD HH:mm:ss')} 기준
            {refreshing ? ' · 갱신 중' : ''}
          </div>
        </div>
        <Space>
          <BranchFilterSelect value={branchId} onChange={setBranchId} />
          {refreshing ? <Spin size="small" /> : null}
          {error ? (
            <span
              className="k-chip"
              style={{
                color: 'var(--accent-warn)',
                borderColor: 'rgba(251,191,36,0.35)',
                background: 'var(--accent-warn-soft)',
              }}
            >
              <span
                className="k-dot"
                style={{ background: 'var(--accent-warn)' }}
              />
              {error}
            </span>
          ) : null}
        </Space>
      </div>

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
