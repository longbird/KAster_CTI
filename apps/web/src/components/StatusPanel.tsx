import type { QueueSummary } from '../types/cti';

interface Props {
  queues: QueueSummary[];
}

// v2 Operator — hairline-divided queue rows.
export function StatusPanel({ queues }: Props) {
  return (
    <div className="k-panel overflow-hidden">
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line-1)' }}>
        <h4 className="text-[15px] font-semibold text-[var(--fg-1)]">큐 상태</h4>
      </div>
      {queues.length === 0 ? (
        <div className="px-5 py-6 text-sm text-[var(--fg-3)]">표시할 큐가 없습니다.</div>
      ) : (
        <div>
          {queues.map((q, idx) => {
            const total = Math.max(1, q.availableAgents + q.talkingCount + q.waitingCount);
            const percent = Math.min(100, Math.round((q.waitingCount / total) * 100));
            const barColor =
              q.waitingCount === 0
                ? 'var(--signal)'
                : q.waitingCount > 3
                  ? 'var(--accent-danger)'
                  : 'var(--accent-warn)';
            const longestWaitColor =
              q.longestWaitSeconds > 30 ? 'var(--accent-danger)' : 'var(--fg-1)';
            return (
              <div
                key={q.queueId}
                className="px-5 py-4"
                style={{ borderBottom: idx !== queues.length - 1 ? '1px solid var(--line-1)' : undefined }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="k-dot" style={{ background: barColor }} />
                    <span className="text-sm font-semibold text-[var(--fg-1)]">{q.queueName}</span>
                  </div>
                  <span className="k-chip">
                    상담원 <span className="k-num ml-1">{q.availableAgents}</span>명
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="k-eyebrow">대기</span>
                    <span className="k-num text-lg font-semibold" style={{ color: barColor }}>
                      {String(q.waitingCount).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-sm bg-[var(--bg-2)]">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${percent}%`, background: barColor }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="k-eyebrow">최대 대기</span>
                    <span className="k-num text-xs font-semibold" style={{ color: longestWaitColor }}>
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
