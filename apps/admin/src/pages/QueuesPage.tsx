import { Button, Card, Descriptions, Drawer, List, Skeleton, Table, Tag, Typography } from 'antd';
import { DownloadOutlined, RightOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ACCESS_TOKEN_KEY, API_BASE_URL } from '../config';
import { useAdminRealtimeRefresh } from '../realtime/useAdminRealtimeRefresh';
import { downloadCsv } from '../shared/lib/csv';
import { usePermissionStore } from '../store/usePermissionStore';

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

interface QueueMemberRow {
  agentId: string;
  queueId: string;
  penalty?: number | null;
  memberOrder?: number | null;
  agent?: {
    agentName?: string | null;
    extension?: string | null;
    role?: string | null;
    loginId?: string | null;
  } | null;
}

function readToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function QueuesPage() {
  const queuePermission = usePermissionStore((state) => state.permissionsByMenu['queues']);
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const [members, setMembers] = useState<QueueMemberRow[] | null>(null);

  const authHeaders = useCallback(() => {
    const token = readToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/queues/summary`, {
        headers: authHeaders(),
      });
      setRows(res.data?.data?.queues ?? []);
    } catch {
      setRows([]);
    }
  }, [authHeaders]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(load, 5000);
    return () => {
      window.clearInterval(timer);
    };
  }, [load]);

  useAdminRealtimeRefresh(() => void load(), [
    'queue.summary.updated',
    'call.created',
    'call.updated',
    'call.ended',
    'agent.status.changed',
  ]);

  useEffect(() => {
    if (!selectedQueueId) {
      setMembers(null);
      return;
    }

    let active = true;
    setMembers(null);
    axios.get(`${API_BASE_URL}/queues/${selectedQueueId}/members`, { headers: authHeaders() })
      .then((res) => {
        if (active) setMembers(res.data?.data ?? []);
      })
      .catch(() => {
        if (active) setMembers([]);
      });
    return () => {
      active = false;
    };
  }, [authHeaders, selectedQueueId]);

  const selectedQueue = useMemo(
    () => rows?.find((row) => row.queueId === selectedQueueId) ?? null,
    [rows, selectedQueueId],
  );

  if (!rows) return <Skeleton active paragraph={{ rows: 8 }} />;

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
              이벤트 즉시 갱신 / 5초 보정 · `/api/v1/queues/summary`
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
        <Table<QueueRow>
          rowKey="queueId"
          dataSource={rows}
          pagination={false}
          onRow={(record) => ({
            onClick: () => setSelectedQueueId(record.queueId),
            style: { cursor: 'pointer' },
          })}
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
              title: '최근 30분',
              render: (_, r) => (
                <>
                  <Tag color="green">응답 {r.recentAnswered}</Tag>
                  <Tag color="red">포기 {r.recentAbandoned}</Tag>
                </>
              ),
            },
            {
              title: '',
              width: 48,
              render: () => <RightOutlined style={{ color: '#8c8c8c' }} />,
            },
          ]}
        />
      </Card>

      <Drawer
        title={selectedQueue ? `${selectedQueue.queueDisplayName ?? selectedQueue.queueName} 상세` : '큐 상세'}
        open={Boolean(selectedQueueId)}
        width={520}
        onClose={() => setSelectedQueueId(null)}
        destroyOnClose
      >
        {selectedQueue ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="대기">{selectedQueue.waiting}</Descriptions.Item>
              <Descriptions.Item label="링잉">{selectedQueue.ringing}</Descriptions.Item>
              <Descriptions.Item label="통화 중">{selectedQueue.talking}</Descriptions.Item>
              <Descriptions.Item label="가용">{selectedQueue.available}</Descriptions.Item>
              <Descriptions.Item label="일시정지">{selectedQueue.paused}</Descriptions.Item>
              <Descriptions.Item label="최장 대기">{selectedQueue.longestWaitSeconds ?? 0}s</Descriptions.Item>
              <Descriptions.Item label="최근 응답">{selectedQueue.recentAnswered}</Descriptions.Item>
              <Descriptions.Item label="최근 포기">{selectedQueue.recentAbandoned}</Descriptions.Item>
            </Descriptions>

            <div>
              <Typography.Title level={5} style={{ marginTop: 0 }}>
                상담원 멤버
              </Typography.Title>
              {members === null ? (
                <Skeleton active paragraph={{ rows: 4 }} />
              ) : (
                <List
                  bordered
                  dataSource={members}
                  locale={{ emptyText: '표시할 멤버가 없습니다.' }}
                  renderItem={(member) => (
                    <List.Item>
                      <List.Item.Meta
                        title={member.agent?.agentName ?? member.agent?.loginId ?? member.agentId}
                        description={[
                          member.agent?.extension ? `내선 ${member.agent.extension}` : null,
                          member.agent?.role ?? null,
                          member.penalty != null ? `패널티 ${member.penalty}` : null,
                          member.memberOrder != null ? `순서 ${member.memberOrder}` : null,
                        ].filter(Boolean).join(' · ')}
                      />
                    </List.Item>
                  )}
                />
              )}
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
