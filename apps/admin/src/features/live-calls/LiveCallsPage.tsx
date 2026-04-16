import { Badge, Card, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { CallDetailDrawer, type CallRow } from './CallDetailDrawer';

const STATUS_COLOR: Record<string, string> = {
  QUEUED: 'gold',
  RINGING_AGENT: 'blue',
  TALKING: 'green',
  AFTER_CALL_WORK: 'purple',
};

function fmtSec(sec?: number) {
  if (!sec) return '0s';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function LiveCallsPage() {
  const [rows, setRows] = useState<CallRow[]>([]);
  const [selected, setSelected] = useState<CallRow | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = async () => {
    try {
      const res = await apiClient.get('/calls/active');
      setRows(res.data?.data ?? []);
      setLastUpdated(new Date());
    } catch {
      // keep previous data on error
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          통화 현황 조회
        </Typography.Title>
        <Typography.Text type="secondary">
          {lastUpdated ? `${lastUpdated.toLocaleTimeString()} 기준` : '로딩 중...'}&nbsp;
          <Badge status="processing" text="3초 갱신" />
        </Typography.Text>
      </div>

      <Table<CallRow>
        rowKey="callId"
        dataSource={rows}
        pagination={false}
        onRow={(r) => ({ onClick: () => setSelected(r), style: { cursor: 'pointer' } })}
        locale={{ emptyText: '현재 활성 통화가 없습니다.' }}
        columns={[
          {
            title: '상태',
            dataIndex: 'sessionStatus',
            width: 130,
            render: (v: string) => <Tag color={STATUS_COLOR[v] ?? 'default'}>{v}</Tag>,
          },
          { title: '고객 번호', dataIndex: 'ani', width: 140 },
          { title: '큐', dataIndex: 'queueName', render: (v?: string) => v ?? '-' },
          {
            title: '상담원',
            render: (_: unknown, r: CallRow) => r.agentName || r.primaryAgentId || '-',
          },
          {
            title: '대기시간',
            dataIndex: 'waitSeconds',
            render: (v?: number) => fmtSec(v),
          },
          {
            title: '통화시간',
            dataIndex: 'talkSeconds',
            render: (v?: number) => fmtSec(v),
          },
          {
            title: '큐 진입',
            dataIndex: 'queuedAt',
            render: (v?: string) => v ? new Date(v).toLocaleTimeString() : '-',
          },
        ]}
      />

      <CallDetailDrawer
        call={selected}
        onClose={() => setSelected(null)}
        onHangup={() => void load()}
      />
    </Card>
  );
}
