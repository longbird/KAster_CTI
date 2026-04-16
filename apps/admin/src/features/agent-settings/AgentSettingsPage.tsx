import { Button, Card, Skeleton, Table, Tag, Typography } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { AgentEditModal, type AgentRow } from './AgentEditModal';

const STATUS_COLOR: Record<string, string> = {
  AVAILABLE: 'green',
  TALKING: 'blue',
  RINGING: 'gold',
  AFTER_CALL_WORK: 'purple',
  BREAK: 'red',
  MEAL: 'orange',
  MANUAL_PAUSED: 'default',
};

export function AgentSettingsPage() {
  const [rows, setRows] = useState<AgentRow[] | null>(null);
  const [editing, setEditing] = useState<AgentRow | null>(null);

  const load = async () => {
    try {
      const res = await apiClient.get('/agents');
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    }
  };

  useEffect(() => { void load(); }, []);

  if (!rows) return <Skeleton active paragraph={{ rows: 8 }} />;

  return (
    <Card>
      <Typography.Title level={4} style={{ marginTop: 0 }}>상담원 설정</Typography.Title>
      <Table<AgentRow>
        rowKey="agentId"
        dataSource={rows}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: '이름', dataIndex: 'agentName' },
          { title: '로그인 ID', dataIndex: 'loginId' },
          { title: '내선', dataIndex: 'extension' },
          { title: '역할', dataIndex: 'role', render: (v: string) => <Tag>{v}</Tag> },
          {
            title: '현재 상태',
            render: (_: unknown, r: AgentRow) =>
              r.currentStatus ? (
                <Tag color={STATUS_COLOR[r.currentStatus.statusCode] ?? 'default'}>
                  {r.currentStatus.statusCode}
                </Tag>
              ) : (
                <Tag>OFFLINE</Tag>
              ),
          },
          {
            title: '액션',
            width: 80,
            render: (_: unknown, r: AgentRow) => (
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)}>
                수정
              </Button>
            ),
          },
        ]}
      />

      <AgentEditModal
        agent={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />
    </Card>
  );
}
