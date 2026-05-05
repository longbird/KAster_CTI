import type { QueueSummary } from '../types/cti';

interface Props {
  queues: QueueSummary[];
}

// "The Precision Curator" queue status 패널.
// - 카드 테두리 없음. surface-container-low 내부에 각 큐를 세로로.
// - waiting 바 + longest wait + 가용 agents 배지.
export function StatusPanel({ queues }: Props) {
  return (
    <div className="overflow-hidden rounded-lg bg-surface-container-lowest shadow-panel">
      <div className="p-6">
        <h4 className="font-headline text-base font-bold text-on-surface">큐 상태</h4>
      </div>
      {queues.length === 0 ? (
        <div className="p-6 pt-0 text-sm text-outline">표시할 큐가 없습니다.</div>
      ) : (
        <div>
          {queues.map((q, idx) => {
            const total = Math.max(1, q.availableAgents + q.talkingCount + q.waitingCount);
            const percent = Math.min(100, Math.round((q.waitingCount / total) * 100));
            const barColor =
              q.waitingCount === 0 ? 'bg-tertiary' : q.waitingCount > 3 ? 'bg-error' : 'bg-primary';
            const longestWaitColor = q.longestWaitSeconds > 30 ? 'text-error' : 'text-on-surface';
            return (
              <div
                key={q.queueId}
                className={`p-6 ${idx !== queues.length - 1 ? 'pb-6' : ''}`}
                style={idx !== queues.length - 1 ? { paddingBottom: 24 } : {}}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${barColor}`} />
                    <span className="font-headline text-sm font-bold text-on-surface">
                      {q.queueName}
                    </span>
                  </div>
                  <span className="rounded-full bg-secondary-container px-2 py-0.5 text-[10px] font-bold text-on-secondary-container">
                    상담원 {q.availableAgents}명
                  </span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-on-surface-variant">대기</span>
                    <span className="font-headline text-lg font-bold text-primary">
                      {String(q.waitingCount).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                    <div
                      className={`h-full transition-all ${barColor}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-outline">최대 대기</span>
                    <span className={`text-xs font-bold ${longestWaitColor}`}>
                      {formatWait(q.longestWaitSeconds)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatWait(sec: number): string {
  if (!sec || sec <= 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
