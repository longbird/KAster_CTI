import { Card, Col, Row, Skeleton, Statistic, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { AgentWorkTimeChart } from './AgentWorkTimeChart';
import { ResponsiveTable } from '../../components/ResponsiveTable';

interface QueueKpi {
  queueName: string;
  queueDisplayName?: string;
  waiting: number;
  talking: number;
  available: number;
  longestWaitSeconds: number;
  recentAnswered: number;
  recentAbandoned: number;
}

interface TrafficRow {
  hour: string;
  inbound: number;
  answered: number;
  abandoned: number;
}

interface DashboardData {
  today?: { answered: number; abandoned: number };
  queues?: QueueKpi[];
  agentStatusDistribution?: Record<string, number>;
  traffic?: TrafficRow[];
}

export function buildKpiCards(data: DashboardData) {
  const queues: QueueKpi[] = data.queues ?? [];
  const today = data.today ?? { answered: 0, abandoned: 0 };
  const total = today.answered + today.abandoned;
  const answerRate = total > 0 ? Math.round((today.answered / total) * 100) : 0;
  const idleAgents = data.agentStatusDistribution?.AVAILABLE ?? 0;

  return [
    { title: '오늘 응답', value: today.answered, suffix: '건', color: 'var(--signal)' },
    { title: '오늘 포기', value: today.abandoned, suffix: '건', color: 'var(--accent-danger)' },
    { title: '응답률', value: answerRate, suffix: '%', color: answerRate >= 80 ? 'var(--signal)' : 'var(--accent-warn)' },
    { title: '대기 콜', value: queues.reduce((s, q) => s + q.waiting, 0), suffix: '건', color: 'var(--accent-warn)' },
    { title: '현재 통화 중', value: queues.reduce((s, q) => s + q.talking, 0), suffix: '건', color: 'var(--accent-info)' },
    { title: '대기 상담원', value: idleAgents, suffix: '명', color: 'var(--fg-2)' },
  ];
}

export function KpiPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await apiClient.get('/admin/dashboard');
        if (active) setData(res.data?.data ?? {});
      } catch {
        if (active) setData({});
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!data) return <Skeleton active paragraph={{ rows: 10 }} />;

  const queues: QueueKpi[] = data.queues ?? [];
  const kpiCards = buildKpiCards(data);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Typography.Title level={4} style={{ margin: 0 }}>업무 현황 조회</Typography.Title>

      <Row gutter={[16, 16]}>
        {kpiCards.map((kpi) => (
          <Col key={kpi.title} xs={24} sm={12} md={8} lg={4}>
            <Card size="small">
              <Statistic
                title={kpi.title}
                value={kpi.value}
                suffix={kpi.suffix}
                valueStyle={{ color: kpi.color, fontSize: 24 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card title="큐별 현황 (최근 30분)">
        <ResponsiveTable<QueueKpi>
          rowKey="queueName"
          dataSource={queues}
          pagination={false}
          size="small"
          columns={[
            {
              title: '큐',
              render: (_: unknown, r: QueueKpi) => r.queueDisplayName ?? r.queueName,
            },
            { title: '대기', dataIndex: 'waiting' },
            { title: '통화 중', dataIndex: 'talking' },
            { title: '가용', dataIndex: 'available' },
            {
              title: '최장 대기',
              dataIndex: 'longestWaitSeconds',
              render: (v: number) => {
                const color = v > 180 ? 'error' : v > 60 ? 'warning' : 'success';
                return <Tag color={color}>{v}s</Tag>;
              },
            },
            {
              title: '응답',
              dataIndex: 'recentAnswered',
              render: (v: number) => <Tag color="success">{v}건</Tag>,
            },
            {
              title: '포기',
              dataIndex: 'recentAbandoned',
              render: (v: number) => <Tag color="error">{v}건</Tag>,
            },
            {
              title: '응답률',
              render: (_: unknown, r: QueueKpi) => {
                const t = r.recentAnswered + r.recentAbandoned;
                const rate = t > 0 ? Math.round((r.recentAnswered / t) * 100) : 0;
                return <Tag color={rate >= 80 ? 'success' : 'warning'}>{rate}%</Tag>;
              },
            },
          ]}
        />
      </Card>

      <AgentWorkTimeChart />

      {data.traffic && data.traffic.length > 0 && (
        <Card title="시간대별 트래픽">
          <ResponsiveTable<TrafficRow>
            rowKey="hour"
            dataSource={data.traffic}
            pagination={false}
            size="small"
            columns={[
              { title: '시간대', dataIndex: 'hour', width: 80 },
              { title: '인입', dataIndex: 'inbound' },
              { title: '응답', dataIndex: 'answered' },
              { title: '포기', dataIndex: 'abandoned' },
              {
                title: '응답률',
                render: (_: unknown, r: TrafficRow) => {
                  const rate = r.inbound > 0 ? Math.round((r.answered / r.inbound) * 100) : 0;
                  return <Tag color={rate >= 80 ? 'success' : 'warning'}>{rate}%</Tag>;
                },
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
}
