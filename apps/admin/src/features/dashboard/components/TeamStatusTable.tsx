import { Card, Table } from 'antd';
import type { AgentTeamSummaryItem } from '../types/dashboard';

export function TeamStatusTable({ items, compact = false }: { items: AgentTeamSummaryItem[]; compact?: boolean }) {
  return (
    <Card
      title="팀별 상담원 현황"
      size={compact ? 'small' : 'default'}
      bodyStyle={compact ? { padding: 8 } : undefined}
      style={{ height: '100%' }}
    >
      <Table
        size="small"
        rowKey="teamName"
        pagination={false}
        dataSource={items}
        columns={[
          { title: '팀', dataIndex: 'teamName' },
          { title: '가용', dataIndex: 'available' },
          { title: '호출', dataIndex: 'ringing' },
          { title: '통화', dataIndex: 'talking' },
          { title: '후처리', dataIndex: 'acw' },
          { title: '휴식', dataIndex: 'break' },
        ]}
      />
    </Card>
  );
}
