import { Button, Card, Skeleton, Table, Tag, Typography } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { QueueEditModal, type QueueRow } from './QueueEditModal';

export function QueueSettingsPage() {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [editing, setEditing] = useState<QueueRow | null>(null);

  const load = async () => {
    try {
      const res = await apiClient.get('/queues');
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    }
  };

  useEffect(() => { void load(); }, []);

  if (!rows) return <Skeleton active paragraph={{ rows: 6 }} />;

  return (
    <Card>
      <Typography.Title level={4} style={{ marginTop: 0 }}>호 분배룰 설정</Typography.Title>
      <Table<QueueRow>
        rowKey="queueId"
        dataSource={rows}
        pagination={false}
        columns={[
          {
            title: '큐명',
            render: (_: unknown, r: QueueRow) => r.queueDisplayName ?? r.queueName,
          },
          { title: '내부명', dataIndex: 'queueName' },
          {
            title: '분배 전략',
            dataIndex: 'strategy',
            render: (v?: string) => v ? <Tag>{v}</Tag> : '-',
          },
          {
            title: '최대 대기(초)',
            dataIndex: 'maxWaitSeconds',
            render: (v?: number) => v ?? '-',
          },
          {
            title: '링 타임아웃(초)',
            dataIndex: 'ringTimeoutSeconds',
            render: (v?: number) => v ?? '-',
          },
          {
            title: '후처리(초)',
            dataIndex: 'wrapupSeconds',
            render: (v?: number) => v ?? '-',
          },
          {
            title: 'Auto Pause',
            dataIndex: 'autopause',
            render: (v?: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'ON' : 'OFF'}</Tag>,
          },
          {
            title: '상태',
            dataIndex: 'isActive',
            render: (v?: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '활성' : '비활성'}</Tag>,
          },
          {
            title: '액션',
            width: 80,
            render: (_: unknown, r: QueueRow) => (
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)}>
                수정
              </Button>
            ),
          },
        ]}
      />

      <QueueEditModal
        queue={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />
    </Card>
  );
}
