import { Card, Progress, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { QueueSummaryItem } from '../types/dashboard';
import { formatSecondsToClock } from '../../../shared/lib/format';

export function QueueSummaryTable({ items, compact = false }: { items: QueueSummaryItem[]; compact?: boolean }) {
  const compactColumns: ColumnsType<QueueSummaryItem> = [
    {
      title: '큐',
      dataIndex: 'queueName',
      width: 156,
      ellipsis: { showTitle: true },
      render: (value: string) => <span className="queue-summary-table__queue-name">{value}</span>,
    },
    { title: '대기', dataIndex: 'waiting', width: 42 },
    { title: '통화', dataIndex: 'talking', width: 42 },
    {
      title: '최장',
      dataIndex: 'longestWaitSec',
      width: 72,
      render: (value: number) => formatSecondsToClock(value),
    },
  ];

  const fullColumns: ColumnsType<QueueSummaryItem> = [
    {
      title: '큐',
      dataIndex: 'queueName',
      width: 220,
      ellipsis: { showTitle: true },
      render: (value: string) => <span className="queue-summary-table__queue-name">{value}</span>,
    },
    { title: '대기', dataIndex: 'waiting', width: 56 },
    { title: '통화', dataIndex: 'talking', width: 56 },
    { title: '가용 상담원', dataIndex: 'availableAgents', width: 96 },
    {
      title: '최장',
      dataIndex: 'longestWaitSec',
      width: 84,
      render: (value: number) => formatSecondsToClock(value),
    },
    {
      title: 'SLA',
      dataIndex: 'answerRate',
      width: 140,
      render: (value: number) => <Progress percent={value} size="small" />,
    },
    {
      title: '초과',
      dataIndex: 'slaBreached',
      width: 64,
      render: (value: number) => <Tag color={value > 0 ? 'error' : 'success'}>{value}</Tag>,
    },
  ];

  const columns = compact ? compactColumns : fullColumns;

  return (
    <Card
      className="queue-summary-table"
      title="Queue 요약"
      size={compact ? 'small' : 'default'}
      styles={compact ? { body: { padding: 8 } } : undefined}
      style={{ height: '100%' }}
    >
      <Table
        className="queue-summary-table__table"
        size="small"
        rowKey="queueName"
        pagination={false}
        dataSource={items}
        columns={columns}
        tableLayout="fixed"
      />
    </Card>
  );
}
