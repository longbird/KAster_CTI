import { Button, Card, DatePicker, Select, Space, Table, Tag, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { BranchFilterSelect } from '../../shared/branches/BranchFilterSelect';

interface CdrRow {
  callId: string;
  ani: string;
  dnis: string;
  queueName: string;
  sessionStatus: string;
  direction: string;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  waitSeconds: number;
  talkSeconds: number;
  abandonFlag: boolean;
  recordingFlag: boolean;
  primaryAgent: { agentName: string } | null;
}

const STATUS_COLOR: Record<string, string> = {
  ENDED: 'default',
  QUEUED: 'orange',
  TALKING: 'blue',
  AFTER_CALL_WORK: 'purple',
  RINGING_AGENT: 'gold',
};

export function CallsReportPage() {
  const [rows, setRows]       = useState<CdrRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange]     = useState<[Dayjs, Dayjs]>([dayjs().startOf('day'), dayjs()]);
  const [mode, setMode]       = useState<'all' | 'missed'>('all');
  const [branchId, setBranchId] = useState<string | undefined>(undefined);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/calls/history', {
        params: {
          from: range[0].toISOString(),
          to:   range[1].toISOString(),
          mode: mode === 'missed' ? 'missed' : undefined,
          branchId,
        },
      });
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Typography.Title level={4} style={{ marginTop: 0 }}>통화내역 조회</Typography.Title>
      <Space style={{ marginBottom: 16 }} wrap>
        <DatePicker.RangePicker
          showTime
          value={range}
          onChange={(v) => v && setRange(v as [Dayjs, Dayjs])}
        />
        <BranchFilterSelect value={branchId} onChange={setBranchId} />
        <Select
          value={mode}
          onChange={setMode}
          options={[
            { value: 'all',    label: '전체' },
            { value: 'missed', label: '미연결만' },
          ]}
          style={{ width: 120 }}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => void load()} loading={loading}>
          조회
        </Button>
      </Space>
      <Table<CdrRow>
        rowKey="callId"
        dataSource={rows}
        loading={loading}
        size="small"
        pagination={{ pageSize: 50 }}
        columns={[
          {
            title: '시작',
            dataIndex: 'startedAt',
            render: (v: string) => dayjs(v).format('MM-DD HH:mm:ss'),
            width: 130,
          },
          { title: '발신번호', dataIndex: 'ani', width: 120 },
          { title: '수신번호', dataIndex: 'dnis', width: 120 },
          { title: '큐', dataIndex: 'queueName', width: 120 },
          {
            title: '상담원',
            render: (_: unknown, r: CdrRow) => r.primaryAgent?.agentName ?? '-',
            width: 100,
          },
          {
            title: '상태',
            dataIndex: 'sessionStatus',
            render: (v: string) => <Tag color={STATUS_COLOR[v] ?? 'default'}>{v}</Tag>,
            width: 120,
          },
          { title: '대기(초)', dataIndex: 'waitSeconds', width: 80 },
          { title: '통화(초)', dataIndex: 'talkSeconds', width: 80 },
          {
            title: '포기',
            dataIndex: 'abandonFlag',
            render: (v: boolean) => (v ? <Tag color="red">포기</Tag> : '-'),
            width: 60,
          },
          {
            title: '녹취',
            dataIndex: 'recordingFlag',
            render: (v: boolean) => (v ? <Tag color="blue">Y</Tag> : '-'),
            width: 60,
          },
        ]}
      />
    </Card>
  );
}
