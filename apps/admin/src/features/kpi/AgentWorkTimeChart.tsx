import { Column } from '@ant-design/charts';
import { Card, DatePicker, Empty, Radio, Select, Skeleton, Space, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';

type Granularity = 'hour' | 'half_hour' | 'day';
type GroupBy = 'agent' | 'group';

interface BucketRow {
  bucketStart: string;
  seriesKey: string;
  seriesLabel: string;
  statusCode: string;
  seconds: number;
}

interface ResponseShape {
  granularity: Granularity;
  groupBy: GroupBy;
  windowSeconds: number;
  from: string;
  to: string;
  buckets: BucketRow[];
}

interface AgentOption {
  agentId: string;
  agentName: string;
}

interface AgentGroupOption {
  agentGroupId: string;
  groupName: string;
}

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: '대기',
  TALKING: '통화 중',
  RINGING: '벨 울림',
  RINGING_AGENT: '벨 울림',
  AFTER_CALL_WORK: '후처리',
  BREAK: '휴식',
  MEAL: '식사',
  MANUAL_PAUSED: '일시정지',
};

function formatBucket(bucketStart: string, granularity: Granularity) {
  const d = dayjs(bucketStart);
  if (granularity === 'day') return d.format('MM-DD');
  return d.format('MM-DD HH:mm');
}

function statusToLabel(code: string) {
  return STATUS_LABEL[code] ?? code;
}

export function AgentWorkTimeChart() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(1, 'day').startOf('day'),
    dayjs().endOf('day'),
  ]);
  const [granularity, setGranularity] = useState<Granularity>('hour');
  const [groupBy, setGroupBy] = useState<GroupBy>('agent');
  const [agentId, setAgentId] = useState<string | undefined>(undefined);
  const [agentGroupId, setAgentGroupId] = useState<string | undefined>(undefined);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentGroups, setAgentGroups] = useState<AgentGroupOption[]>([]);
  const [data, setData] = useState<ResponseShape | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void apiClient
      .get('/agents')
      .then((res) => {
        const list: AgentOption[] = (res.data?.data ?? []).map((a: any) => ({
          agentId: a.agentId,
          agentName: a.agentName,
        }));
        setAgents(list);
      })
      .catch(() => setAgents([]));
    void apiClient
      .get('/admin/settings/agent-groups')
      .then((res) => {
        const list: AgentGroupOption[] = (res.data?.data ?? []).map((g: any) => ({
          agentGroupId: g.agentGroupId,
          groupName: g.groupName,
        }));
        setAgentGroups(list);
      })
      .catch(() => setAgentGroups([]));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void apiClient
      .get('/admin/reports/agent-work-time', {
        params: {
          from: range[0].toISOString(),
          to: range[1].toISOString(),
          granularity,
          groupBy,
          agentId,
          agentGroupId,
        },
      })
      .then((res) => {
        if (active) setData(res.data?.data ?? null);
      })
      .catch(() => {
        if (active) setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [range, granularity, groupBy, agentId, agentGroupId]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.buckets.map((b) => ({
      bucket: formatBucket(b.bucketStart, data.granularity),
      series: b.seriesLabel,
      status: statusToLabel(b.statusCode),
      minutes: Math.round((b.seconds / 60) * 10) / 10,
    }));
  }, [data]);

  return (
    <Card title="상담원 업무시간 분포">
      <Space wrap style={{ marginBottom: 16 }}>
        <DatePicker.RangePicker
          value={range}
          onChange={(v) => {
            if (!v?.[0] || !v?.[1]) return;
            setRange([v[0].startOf('day'), v[1].endOf('day')]);
          }}
          showTime={false}
        />
        <Radio.Group
          value={granularity}
          onChange={(e) => setGranularity(e.target.value)}
          options={[
            { value: 'half_hour', label: '30분' },
            { value: 'hour', label: '1시간' },
            { value: 'day', label: '1일' },
          ]}
          optionType="button"
          buttonStyle="solid"
        />
        <Radio.Group
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value)}
          options={[
            { value: 'agent', label: '상담원별' },
            { value: 'group', label: '그룹별' },
          ]}
          optionType="button"
        />
        <Select
          allowClear
          placeholder="상담원 필터"
          style={{ width: 180 }}
          value={agentId}
          onChange={setAgentId}
          showSearch
          optionFilterProp="label"
          options={agents.map((a) => ({ value: a.agentId, label: a.agentName }))}
        />
        <Select
          allowClear
          placeholder="그룹 필터"
          style={{ width: 160 }}
          value={agentGroupId}
          onChange={setAgentGroupId}
          showSearch
          optionFilterProp="label"
          options={agentGroups.map((g) => ({ value: g.agentGroupId, label: g.groupName }))}
        />
      </Space>

      {loading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : !data || chartData.length === 0 ? (
        <Empty description="조회 결과 없음" />
      ) : (
        <>
          <Column
            data={chartData}
            xField="bucket"
            yField="minutes"
            colorField="status"
            stack
            seriesField="status"
            tooltip={{
              channel: 'y',
              valueFormatter: (v: number) => `${v}분`,
            }}
            height={360}
            legend={{ color: { position: 'top' } }}
            scrollbar={{ x: { ratio: 0.7 } }}
          />
          <Typography.Text type="secondary" style={{ marginTop: 8, display: 'block' }}>
            * 단위: 분 (`agentStatusHistory` 의 시간대 교차 분배 합산. 윈도우 폭{' '}
            {Math.round(data.windowSeconds / 60)}분 / bucket)
          </Typography.Text>
        </>
      )}
    </Card>
  );
}
