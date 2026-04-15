import { Card, Table, Tag } from 'antd';
import type { ActiveCallItem } from '../types/dashboard';
import { formatSecondsToClock } from '../../../shared/lib/format';

const statusColor: Record<ActiveCallItem['status'], string> = {
  QUEUED: 'default',
  RINGING_AGENT: 'gold',
  TALKING: 'processing',
  TRANSFERRING: 'purple',
};

export function ActiveCallsTable({ items }: { items: ActiveCallItem[] }) {
  return (
    <Card title="실시간 활성 콜">
      <Table
        size="small"
        rowKey="id"
        dataSource={items}
        pagination={false}
        columns={[
          { title: '콜 ID', dataIndex: 'id' },
          { title: '큐', dataIndex: 'queueName' },
          { title: '상담원', dataIndex: 'agentName' },
          { title: '고객 번호', dataIndex: 'customerPhone' },
          { title: '방향', dataIndex: 'direction' },
          { title: '대기', dataIndex: 'waitingSec', render: (value: number) => formatSecondsToClock(value) },
          { title: '통화', dataIndex: 'talkingSec', render: (value: number) => formatSecondsToClock(value) },
          { title: '상태', dataIndex: 'status', render: (value: ActiveCallItem['status']) => <Tag color={statusColor[value]}>{value}</Tag> },
        ]}
      />
    </Card>
  );
}
