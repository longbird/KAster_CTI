import { Card, Typography } from 'antd';
import type { QueueSummary } from '../types/cti';

interface StatusPanelProps {
  queues: QueueSummary[];
}

// 좌측 패널. 과거에는 "상태 변경" 카드가 있었으나 HeaderBar 의 상태 Tag
// Dropdown 으로 옮겨 화면 밀도를 높임. 이 패널은 이제 큐 현황만 담당.
export function StatusPanel({ queues }: StatusPanelProps) {
  return (
    <Card title="개인 큐 / 대기 현황" className="shadow-panel">
      {queues.length === 0 ? (
        <Typography.Text type="secondary">표시할 큐가 없습니다.</Typography.Text>
      ) : (
        <div className="space-y-3">
          {queues.map((queue) => (
            <div key={queue.queueId} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <Typography.Text strong>{queue.queueName}</Typography.Text>
                <Typography.Text type="secondary">
                  최대 대기 {queue.longestWaitSeconds}s
                </Typography.Text>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-sm text-slate-600">
                <div>대기 {queue.waitingCount}</div>
                <div>통화 {queue.talkingCount}</div>
                <div>가용 {queue.availableAgents}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
