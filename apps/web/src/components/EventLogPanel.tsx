import { Card, List, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useCtiStore } from '../store/useCtiStore';
import type { EventLogItem } from '../types/cti';

const TYPE_COLORS: Record<EventLogItem['type'], string> = {
  'call.created': 'blue',
  'call.updated': 'geekblue',
  'call.ended': 'red',
  'screenpop.customer': 'gold',
  'agent.status.changed': 'purple',
  'queue.summary.updated': 'cyan',
  info: 'default',
};

// cti-operational-frontend 의 EventLogPanel 개념 포팅.
// useCtiStore.eventLog (최근 50건) 을 시간 역순 리스트로 렌더.
export function EventLogPanel() {
  const events = useCtiStore((s) => s.eventLog);

  return (
    <Card
      size="small"
      title="실시간 이벤트 로그"
      bodyStyle={{ padding: 0, maxHeight: 320, overflow: 'auto' }}
    >
      <List
        size="small"
        dataSource={events}
        locale={{ emptyText: '아직 수신된 이벤트가 없습니다.' }}
        renderItem={(item) => (
          <List.Item>
            <div className="w-full">
              <div className="flex items-center justify-between">
                <Tag color={TYPE_COLORS[item.type]}>{item.type}</Tag>
                <Typography.Text type="secondary" className="text-xs">
                  {dayjs(item.timestamp).format('HH:mm:ss')}
                </Typography.Text>
              </div>
              <div className="mt-1 text-sm">{item.message}</div>
            </div>
          </List.Item>
        )}
      />
    </Card>
  );
}
