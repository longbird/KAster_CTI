import { Card, Skeleton, Table, Tag, Typography } from 'antd';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { ACCESS_TOKEN_KEY, API_BASE_URL } from '../config';

interface QueueRow {
  queueId: string;
  queueName: string;
  queueDisplayName?: string;
  waiting: number;
  ringing: number;
  talking: number;
  available: number;
  paused: number;
  longestWaitSeconds: number;
  recentAnswered: number;
  recentAbandoned: number;
}

function readToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

// /queues/summary 를 주기 폴링해 표 형태로 렌더. 클릭 시 drill-down 은 후속.
export function QueuesPage() {
  const [rows, setRows] = useState<QueueRow[] | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const token = readToken();
        const res = await axios.get(`${API_BASE_URL}/queues/summary`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!active) return;
        setRows(res.data?.data?.queues ?? []);
      } catch {
        if (!active) return;
        setRows([]);
      }
    };

    void load();
    const timer = window.setInterval(load, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!rows) return <Skeleton active paragraph={{ rows: 8 }} />;

  return (
    <Card>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        큐 현황
      </Typography.Title>
      <Typography.Text type="secondary">5초 주기로 `/api/v1/queues/summary` 폴링</Typography.Text>
      <Table<QueueRow>
        style={{ marginTop: 16 }}
        rowKey="queueId"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: '큐', dataIndex: 'queueDisplayName', render: (v, r) => v ?? r.queueName },
          { title: '대기', dataIndex: 'waiting' },
          { title: 'Ringing', dataIndex: 'ringing' },
          { title: 'Talking', dataIndex: 'talking' },
          { title: 'Available', dataIndex: 'available' },
          { title: 'Paused', dataIndex: 'paused' },
          {
            title: '최장 대기',
            dataIndex: 'longestWaitSeconds',
            render: (v: number) => `${v ?? 0}s`,
          },
          {
            title: '최근 30분',
            render: (_, r) => (
              <>
                <Tag color="green">응답 {r.recentAnswered}</Tag>
                <Tag color="red">포기 {r.recentAbandoned}</Tag>
              </>
            ),
          },
        ]}
      />
    </Card>
  );
}
