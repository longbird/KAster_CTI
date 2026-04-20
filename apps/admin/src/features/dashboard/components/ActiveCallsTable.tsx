import { Card, Table, Tag } from 'antd';
import type { ActiveCallItem } from '../types/dashboard';
import { formatSecondsToClock } from '../../../shared/lib/format';

const statusColor: Record<ActiveCallItem['status'], string> = {
  NEW: 'blue',
  QUEUED: 'default',
  RINGING_AGENT: 'gold',
  TALKING: 'processing',
  HOLD: 'orange',
  TRANSFERRING: 'purple',
  AFTER_CALL_WORK: 'cyan',
};

const statusLabel: Record<ActiveCallItem['status'], string> = {
  NEW: '인입 중',
  QUEUED: '대기열',
  RINGING_AGENT: '벨 울림',
  TALKING: '통화 중',
  HOLD: '보류',
  TRANSFERRING: '전환 중',
  AFTER_CALL_WORK: '후처리',
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
          { title: '방향', dataIndex: 'direction', render: (value: ActiveCallItem['direction']) => value === 'outbound' ? '발신' : '수신' },
          { title: '대기', dataIndex: 'waitingSec', render: (value: number) => formatSecondsToClock(value) },
          { title: '통화', dataIndex: 'talkingSec', render: (value: number) => formatSecondsToClock(value) },
          { title: '상태', dataIndex: 'status', render: (value: ActiveCallItem['status']) => <Tag color={statusColor[value]}>{statusLabel[value] ?? '알 수 없음'}</Tag> },
        ]}
      />
    </Card>
  );
}
