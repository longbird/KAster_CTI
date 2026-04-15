import { Card, Progress, Table, Tag } from 'antd';
import type { QueueSummaryItem } from '../types/dashboard';
import { formatSecondsToClock } from '../../../shared/lib/format';

export function QueueSummaryTable({ items }: { items: QueueSummaryItem[] }) {
  return (
    <Card title="Queue 요약">
      <Table
        size="small"
        rowKey="queueName"
        pagination={false}
        dataSource={items}
        columns={[
          { title: '큐', dataIndex: 'queueName' },
          { title: '대기', dataIndex: 'waiting' },
          { title: '통화중', dataIndex: 'talking' },
          { title: '가용 상담원', dataIndex: 'availableAgents' },
          {
            title: '최장 대기',
            dataIndex: 'longestWaitSec',
            render: (value: number) => formatSecondsToClock(value),
          },
          {
            title: '응답률',
            dataIndex: 'answerRate',
            render: (value: number) => <Progress percent={value} size="small" />,
          },
          {
            title: 'SLA 초과',
            dataIndex: 'slaBreached',
            render: (value: number) => <Tag color={value > 0 ? 'error' : 'success'}>{value}</Tag>,
          },
        ]}
      />
    </Card>
  );
}
