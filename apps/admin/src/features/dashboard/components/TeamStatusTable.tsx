import { Card, Table } from 'antd';
import type { AgentTeamSummaryItem } from '../types/dashboard';

export function TeamStatusTable({ items }: { items: AgentTeamSummaryItem[] }) {
  return (
    <Card title="팀별 상담원 현황">
      <Table
        size="small"
        rowKey="teamName"
        pagination={false}
        dataSource={items}
        columns={[
          { title: '팀', dataIndex: 'teamName' },
          { title: '가용', dataIndex: 'available' },
          { title: '호출중', dataIndex: 'ringing' },
          { title: '통화중', dataIndex: 'talking' },
          { title: '후처리', dataIndex: 'acw' },
          { title: '휴식', dataIndex: 'break' },
        ]}
      />
    </Card>
  );
}
