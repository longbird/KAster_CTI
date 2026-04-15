import { TeamOutlined } from '@ant-design/icons';
import { Card, Typography } from 'antd';
import type { QueueSummary } from '../types/cti';

interface StatusPanelProps {
  queues: QueueSummary[];
}

// 좌측 패널. 상태 변경은 HeaderBar 의 Tag dropdown 으로 이동했고, 여기는
// 큐 현황만 담당한다.
export function StatusPanel({ queues }: StatusPanelProps) {
  return (
    <Card
      title={
        <span className="text-base font-semibold text-slate-800">
          <TeamOutlined className="mr-2" />큐 대기 현황
        </span>
      }
      className="rounded-2xl border border-slate-200/70 shadow-sm"
      bodyStyle={{ padding: 16 }}
    >
      {queues.length === 0 ? (
        <Typography.Text type="secondary">표시할 큐가 없습니다.</Typography.Text>
      ) : (
        <div className="space-y-3">
          {queues.map((q) => {
            const saturation =
              q.availableAgents > 0
                ? Math.min(100, Math.round((q.waitingCount / q.availableAgents) * 40))
                : q.waitingCount > 0
                ? 100
                : 0;
            const stress =
              q.waitingCount === 0
                ? 'bg-emerald-500'
                : q.waitingCount < 3
                ? 'bg-amber-500'
                : 'bg-rose-500';
            return (
              <div
                key={q.queueId}
                className="rounded-xl border border-slate-200/80 bg-white p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <Typography.Text strong className="text-slate-800">
                    {q.queueName}
                  </Typography.Text>
                  <Typography.Text type="secondary" className="text-xs">
                    최대 대기 {q.longestWaitSeconds}s
                  </Typography.Text>
                </div>

                {/* 스트레스 바 */}
                <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full transition-all ${stress}`}
                    style={{ width: `${saturation}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3 text-slate-600">
                    <StatChip label="대기" value={q.waitingCount} />
                    <StatChip label="통화" value={q.talkingCount} />
                  </div>
                  <div className="flex items-center gap-1 text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    가용 {q.availableAgents}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <span className="text-slate-400">{label}</span>{' '}
      <span className="font-semibold text-slate-800">{value}</span>
    </span>
  );
}
