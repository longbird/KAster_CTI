import { Card, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { AgentStatusSummaryItem } from '../types/dashboard';
import { AGENT_STATUS_TONE } from '../../../shared/ui/tagTone';

export function AgentStatusSummaryTable({
  items,
  compact = false,
}: {
  items: AgentStatusSummaryItem[];
  compact?: boolean;
}) {
  const columns: ColumnsType<AgentStatusSummaryItem> = [
    {
      title: '상태',
      dataIndex: 'label',
      width: compact ? 160 : undefined,
      render: (value: string, row) => (
        <Tag color={AGENT_STATUS_TONE[row.statusCode] ?? 'default'} style={{ marginInlineEnd: 0 }}>
          {value}
        </Tag>
      ),
    },
    {
      title: '상담원',
      dataIndex: 'count',
      width: compact ? 80 : undefined,
      align: 'right',
      render: (value: number) => `${value}명`,
    },
  ];

  return (
    <Card
      title="상담원 상태 현황"
      size={compact ? 'small' : 'default'}
      styles={compact ? { body: { padding: 8 } } : undefined}
      style={{ height: '100%' }}
    >
      <Table
        size="small"
        rowKey="statusCode"
        pagination={false}
        dataSource={items}
        columns={columns}
        tableLayout={compact ? 'fixed' : undefined}
      />
    </Card>
  );
}
