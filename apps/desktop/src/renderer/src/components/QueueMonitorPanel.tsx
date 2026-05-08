import { useEffect, useState } from 'react';
import type { QueueSummary } from '../../../shared/cti';

const FLASH_DURATION_MS = 2400;

function formatWait(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function totalWaiting(rows: QueueSummary[]): number {
  return rows.reduce((sum, row) => sum + (row.waitingCount ?? 0), 0);
}

function longestWait(rows: QueueSummary[]): number {
  return rows.reduce((max, row) => Math.max(max, row.longestWaitSeconds ?? 0), 0);
}

export function QueueMonitorPanel({
  queueSummary,
  flashAt,
}: {
  queueSummary: QueueSummary[];
  flashAt: string | null;
}) {
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (!flashAt) {
      return;
    }
    setFlashing(true);
    const timer = setTimeout(() => setFlashing(false), FLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [flashAt]);

  if (queueSummary.length === 0) {
    return null;
  }

  const waiting = totalWaiting(queueSummary);
  const longest = longestWait(queueSummary);
  const className = `queue-monitor${flashing ? ' queue-monitor--flash' : ''}${
    waiting > 0 ? ' queue-monitor--has-waiting' : ''
  }`;

  return (
    <div
      className={className}
      role="status"
      aria-live="polite"
      aria-label="대기열 상태"
      data-testid="queue-monitor"
    >
      <span className="queue-monitor__metric">
        <span className="queue-monitor__label">대기</span>
        <span className="queue-monitor__value">{waiting}</span>
      </span>
      <span className="queue-monitor__metric">
        <span className="queue-monitor__label">최대대기</span>
        <span className="queue-monitor__value">{formatWait(longest)}</span>
      </span>
    </div>
  );
}
