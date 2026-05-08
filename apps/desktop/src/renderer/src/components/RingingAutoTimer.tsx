import { useEffect, useRef, useState } from 'react';

export type RingingAutoAction = 'auto-answer' | 'auto-reject';

const TICK_MS = 100;

export function RingingAutoTimer({
  active,
  totalSeconds,
  action,
  onTrigger,
}: {
  active: boolean;
  totalSeconds: number;
  action: RingingAutoAction;
  onTrigger: () => void;
}) {
  const [remainingMs, setRemainingMs] = useState(totalSeconds * 1000);
  const triggeredRef = useRef(false);

  useEffect(() => {
    triggeredRef.current = false;
    setRemainingMs(totalSeconds * 1000);
  }, [active, totalSeconds]);

  useEffect(() => {
    if (!active || totalSeconds <= 0) {
      return;
    }

    const startedAt = Date.now();
    const totalMs = totalSeconds * 1000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const next = Math.max(0, totalMs - elapsed);
      setRemainingMs(next);
      if (next <= 0 && !triggeredRef.current) {
        triggeredRef.current = true;
        clearInterval(interval);
        onTrigger();
      }
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [active, totalSeconds, onTrigger]);

  if (!active || totalSeconds <= 0) {
    return null;
  }

  const totalMs = totalSeconds * 1000;
  const percent = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const label = action === 'auto-answer' ? '자동 응답' : '자동 거절';

  return (
    <div className={`ringing-auto-timer ringing-auto-timer--${action}`} role="status" aria-live="polite">
      <div className="ringing-auto-timer__label">
        <span>{label}</span>
        <span className="ringing-auto-timer__count">{remainingSeconds}초</span>
      </div>
      <div className="ringing-auto-timer__bar">
        <div className="ringing-auto-timer__fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
