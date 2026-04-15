import { Button, Card, Select, Space, Typography } from 'antd';
import { useState } from 'react';
import type { AgentStatusCode, QueueSummary } from '../types/cti';

interface StatusPanelProps {
  currentStatus?: AgentStatusCode;
  queues: QueueSummary[];
  onChangeStatus: (status: AgentStatusCode) => void;
}

const options: AgentStatusCode[] = [
  'AVAILABLE',
  'BREAK',
  'MEAL',
  'TRAINING',
  'MANUAL_PAUSED',
];

export function StatusPanel({ currentStatus, queues, onChangeStatus }: StatusPanelProps) {
  const [status, setStatus] = useState<AgentStatusCode>(currentStatus ?? 'AVAILABLE');

  return (
    <div className="space-y-4">
      <Card title="상태 변경" className="shadow-panel">
        <Space direction="vertical" className="w-full">
          <Select value={status} options={options.map((value) => ({ value, label: value }))} onChange={setStatus} />
          <Button type="primary" block onClick={() => onChangeStatus(status)}>
            상태 적용
          </Button>
          <Typography.Text type="secondary">현재 상태: {currentStatus}</Typography.Text>
        </Space>
      </Card>

      <Card title="개인 큐 / 대기 현황" className="shadow-panel">
        <div className="space-y-3">
          {queues.map((queue) => (
            <div key={queue.queueId} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <Typography.Text strong>{queue.queueName}</Typography.Text>
                <Typography.Text type="secondary">최대 대기 {queue.longestWaitSeconds}s</Typography.Text>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-sm text-slate-600">
                <div>대기 {queue.waitingCount}</div>
                <div>통화 {queue.talkingCount}</div>
                <div>가용 {queue.availableAgents}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
