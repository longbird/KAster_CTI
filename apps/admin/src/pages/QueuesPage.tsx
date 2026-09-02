import { Button, Card, Drawer, Skeleton, Space, Table, Tag, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { ACCESS_TOKEN_KEY, API_BASE_URL } from '../config';
import { downloadCsv } from '../shared/lib/csv';
import { usePermissionStore } from '../store/usePermissionStore';
import { ResponsiveTable } from '../components/ResponsiveTable';

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
  virtualBuffer?: {
    waitingCalls: number;
    longestWaitSeconds: number;
    overThresholdCalls: number;
    status: 'EMPTY' | 'WAITING' | 'OVER_THRESHOLD';
  };
  recentAnswered: number;
  recentAbandoned: number;
}

interface QueueMemberRow {
  queueMemberId: string;
  agent?: {
    agentCode?: string;
    agentName?: string;
    extension?: string;
    role?: string;
    isActive?: boolean;
  };
  penalty?: number;
  memberOrder?: number;
  isActive?: boolean;
}

export function buildQueueDrillDownStats(row: QueueRow) {
  return [
    { label: '대기', value: row.waiting },
    { label: '링잉', value: row.ringing },
    { label: '통화 중', value: row.talking },
    { label: '가용', value: row.available },
    { label: '일시정지', value: row.paused },
    { label: '최장 대기', value: `${row.longestWaitSeconds ?? 0}s` },
    { label: '최근 응답', value: row.recentAnswered },
    { label: '최근 포기', value: row.recentAbandoned },
  ];
}

function readToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

// /queues/summary 를 주기 폴링해 표 형태로 렌더하고 행 클릭 시 상세 drawer 를 연다.
export function QueuesPage() {
  const queuePermission = usePermissionStore((state) => state.permissionsByMenu['queues']);
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [selected, setSelected] = useState<QueueRow | null>(null);
  const [members, setMembers] = useState<QueueMemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

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

  const openDrillDown = async (row: QueueRow) => {
    setSelected(row);
    setMembers([]);
    setMembersLoading(true);
    try {
      const token = readToken();
      const res = await axios.get(`${API_BASE_URL}/queues/${row.queueId}/members`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setMembers(res.data?.data?.data ?? res.data?.data ?? []);
    } catch {
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  const exportRows = () => {
    downloadCsv(
      `queues-summary-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.csv`,
      ['큐', '대기', 'Ringing', 'Talking', 'Available', 'Paused', '최장 대기(초)', '최근 응답', '최근 포기'],
      rows.map((row) => [
        row.queueDisplayName ?? row.queueName,
        row.waiting,
        row.ringing,
        row.talking,
        row.available,
        row.paused,
        row.longestWaitSeconds,
        row.recentAnswered,
        row.recentAbandoned,
      ]),
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              큐 현황
            </Typography.Title>
            <Typography.Text type="secondary">
              5초 주기로 `/api/v1/queues/summary`를 갱신합니다.
            </Typography.Text>
          </div>
          {queuePermission?.canExport ? (
            <Button icon={<DownloadOutlined />} onClick={exportRows} disabled={rows.length === 0}>
              CSV 내보내기
            </Button>
          ) : null}
        </div>
      </Card>

      <Card>
        <ResponsiveTable<QueueRow>
          rowKey="queueId"
          dataSource={rows}
          pagination={false}
          columns={[
            { title: '큐', dataIndex: 'queueDisplayName', render: (v, r) => v ?? r.queueName },
            { title: '대기', dataIndex: 'waiting' },
            { title: '링잉', dataIndex: 'ringing' },
            { title: '통화 중', dataIndex: 'talking' },
            { title: '가용', dataIndex: 'available' },
            { title: '일시정지', dataIndex: 'paused' },
            {
              title: '최장 대기',
              dataIndex: 'longestWaitSeconds',
              render: (v: number) => `${v ?? 0}s`,
            },
            {
              title: '가상버퍼',
              render: (_, r) => {
                const waiting = r.virtualBuffer?.waitingCalls ?? r.waiting ?? 0;
                const overThreshold = r.virtualBuffer?.overThresholdCalls ?? 0;
                return (
                  <>
                    <Tag color={waiting > 0 ? 'processing' : 'default'}>대기 {waiting}</Tag>
                    <Tag color={overThreshold > 0 ? 'error' : 'success'}>초과 {overThreshold}</Tag>
                  </>
                );
              },
            },
            {
              title: '최근 30분',
              render: (_, r) => (
                <>
                  <Tag color="success">응답 {r.recentAnswered}</Tag>
                  <Tag color="error">포기 {r.recentAbandoned}</Tag>
                </>
              ),
            },
          ]}
          onRow={(row) => ({
            onClick: () => void openDrillDown(row),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>

      <Drawer
        title={selected ? `${selected.queueDisplayName ?? selected.queueName} 상세` : '큐 상세'}
        open={!!selected}
        onClose={() => setSelected(null)}
        width={640}
      >
        {selected ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space wrap>
              {buildQueueDrillDownStats(selected).map((item) => (
                <Tag key={item.label}>
                  {item.label} {item.value}
                </Tag>
              ))}
            </Space>
            <ResponsiveTable<QueueMemberRow>
              rowKey={(row) => row.queueMemberId ?? `${row.agent?.extension}-${row.memberOrder}`}
              dataSource={members}
              loading={membersLoading}
              pagination={false}
              size="small"
              columns={[
                {
                  title: '상담원',
                  render: (_: unknown, row) => row.agent?.agentName ?? row.agent?.agentCode ?? '-',
                },
                {
                  title: '내선',
                  width: 90,
                  render: (_: unknown, row) => row.agent?.extension ?? '-',
                },
                {
                  title: '순서',
                  dataIndex: 'memberOrder',
                  width: 80,
                  render: (value?: number) => value ?? 0,
                },
                {
                  title: '패널티',
                  dataIndex: 'penalty',
                  width: 80,
                  render: (value?: number) => value ?? 0,
                },
                {
                  title: '상태',
                  dataIndex: 'isActive',
                  width: 90,
                  render: (value?: boolean) => <Tag color={value === false ? 'default' : 'success'}>{value === false ? '비활성' : '활성'}</Tag>,
                },
              ]}
            />
          </Space>
        ) : null}
      </Drawer>
    </div>
  );
}
