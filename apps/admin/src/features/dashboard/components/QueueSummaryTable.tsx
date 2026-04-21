import { Card, Progress, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { QueueSummaryItem } from '../types/dashboard';
import { formatSecondsToClock } from '../../../shared/lib/format';

export function QueueSummaryTable({ items, compact = false }: { items: QueueSummaryItem[]; compact?: boolean }) {
  const columns: ColumnsType<QueueSummaryItem> = [
    { title: '큐', dataIndex: 'queueName' },
    { title: '대기', dataIndex: 'waiting', width: 50 },
    { title: '통화', dataIndex: 'talking', width: 50 },
    ...(compact ? [] : [{ title: '가용 상담원', dataIndex: 'availableAgents' } as ColumnsType<QueueSummaryItem>[number]]),
    {
      title: '최장',
      dataIndex: 'longestWaitSec',
      width: 70,
      render: (value: number) => formatSecondsToClock(value),
    },
    {
      title: 'SLA',
      dataIndex: 'answerRate',
      render: (value: number) =>
        compact ? (
          <span style={{ fontVariantNumeric: 'tabular-nums', color: value < 80 ? '#faad14' : '#52c41a' }}>{value}%</span>
        ) : (
          <Progress percent={value} size="small" />
        ),
    },
    {
      title: '초과',
      dataIndex: 'slaBreached',
      width: 60,
      render: (value: number) => <Tag color={value > 0 ? 'error' : 'success'}>{value}</Tag>,
    },
  ];

  return (
    <Card
      title="Queue 요약"
      size={compact ? 'small' : 'default'}
      bodyStyle={compact ? { padding: 8 } : undefined}
      style={{ height: '100%' }}
    >
      <Table size="small" rowKey="queueName" pagination={false} dataSource={items} columns={columns} />
    </Card>
  );
}
