import { Button, Card, DatePicker, Space, Table, Tag, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';

interface MissedRow {
  callId: string;
  ani: string;
  dnis: string;
  queueName: string;
  startedAt: string;
  waitSeconds: number;
  primaryAgent: { agentName: string } | null;
}

export function MissedCallsPage() {
  const [rows, setRows]       = useState<MissedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange]     = useState<[Dayjs, Dayjs]>([dayjs().startOf('day'), dayjs()]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/calls/history', {
        params: {
          from: range[0].toISOString(),
          to:   range[1].toISOString(),
          mode: 'missed',
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
      <Typography.Title level={4} style={{ marginTop: 0 }}>미연결 콜 조회</Typography.Title>
      <Space style={{ marginBottom: 16 }} wrap>
        <DatePicker.RangePicker
          showTime
          value={range}
          onChange={(v) => v && setRange(v as [Dayjs, Dayjs])}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => void load()} loading={loading}>
          조회
        </Button>
      </Space>
      <Table<MissedRow>
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
          { title: '발신번호', dataIndex: 'ani', width: 130 },
          { title: '수신번호', dataIndex: 'dnis', width: 130 },
          { title: '큐', dataIndex: 'queueName', width: 140 },
          {
            title: '최종 상담원',
            render: (_: unknown, r: MissedRow) => r.primaryAgent?.agentName ?? '-',
            width: 110,
          },
          { title: '대기(초)', dataIndex: 'waitSeconds', width: 90 },
          {
            title: '결과',
            render: () => <Tag color="red">미연결</Tag>,
            width: 80,
          },
        ]}
      />
    </Card>
  );
}
