import { Card, Skeleton, Space, Spin, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useDashboardData } from '../hooks/useDashboardData';
import { KpiCards } from './KpiCards';
import { TrafficChartCard } from './TrafficChartCard';
import { QueueSummaryTable } from './QueueSummaryTable';
import { AgentStatusSummaryTable } from './AgentStatusSummaryTable';
import { ActiveCallsKanban } from './ActiveCallsKanban';
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
    <div className="ops-room dashboard-compact">
      <div className="ops-room__bar dashboard-compact__header">
        <Space align="center" size="middle" wrap className="ops-room__bar-left">
          <Typography.Title level={5} style={{ margin: 0 }}>콜센터 운영 대시보드</Typography.Title>
          <Typography.Text type="secondary" className="ops-room__timestamp">
            갱신 {dayjs(data.updatedAt).format('HH:mm:ss')}
          </Typography.Text>
          <BranchFilterSelect value={branchId} onChange={setBranchId} />
          {refreshing ? <Spin size="small" /> : null}
          {error ? <Typography.Text type="warning" style={{ fontSize: 11 }}>{error}</Typography.Text> : null}
        </Space>
        <div className="ops-room__infra">
          <InfraStatusBar />
        </div>
      </div>

      <div className="dashboard-compact__kpi">
        <KpiCards items={data.kpis} compact />
      </div>

      <div className="dashboard-compact__alerts">
        <AlertsPanel items={data.alerts} compact />
      </div>

      <div className="dashboard-compact__calls">
        <ActiveCallsKanban items={data.activeCalls} />
      </div>

      <div className="dashboard-compact__bottom">
        <QueueSummaryTable items={data.queues} compact />
        <AgentStatusSummaryTable items={data.agentStatuses} compact />
        <TrafficChartCard items={data.traffic} compact />
      </div>
    </div>
  );
}
