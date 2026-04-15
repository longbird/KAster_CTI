import { Card, List, Table, Typography } from 'antd';
import type { CallHistoryItem } from '../types/cti';
import { formatDateTime, formatDuration } from '../utils/format';

interface BottomPanelsProps {
  history: CallHistoryItem[];
  notifications: string[];
}

export function BottomPanels({ history, notifications }: BottomPanelsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
      <Card title="최근 통화 이력" className="shadow-panel">
        <Table<CallHistoryItem>
          rowKey="callId"
          size="small"
          pagination={false}
          columns={[
            { title: '고객', dataIndex: 'customerName' },
            { title: '번호', dataIndex: 'phoneNumber' },
            { title: '결과', dataIndex: 'resultCode' },
            { title: '큐', dataIndex: 'queueName' },
            { title: '시작', render: (_, row) => formatDateTime(row.startedAt) },
            { title: '통화시간', render: (_, row) => formatDuration(row.talkSeconds) },
          ]}
          dataSource={history}
          scroll={{ x: 720 }}
        />
      </Card>

      <Card title="시스템 알림" className="shadow-panel">
        <List
          locale={{ emptyText: '표시할 알림이 없습니다.' }}
          dataSource={notifications}
          renderItem={(item, index) => (
            <List.Item>
              <Typography.Text>{index + 1}. {item}</Typography.Text>
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}
