import { useCtiStore } from '../store/useCtiStore';

function formatSeconds(sec: number): string {
  if (!sec || sec <= 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface TileProps {
  label: string;
  value: string | number;
  suffix?: string;
  delta?: { value: string; tone: 'ok' | 'warn' | 'neutral' };
  accent?: boolean;
  waveform?: boolean;
}

function KpiTile({ label, value, suffix, delta, accent, waveform }: TileProps) {
  return (
    <div
      className="rounded-md p-3"
      style={{
        background: 'var(--bg-elevated)',
        border: accent
          ? '1px solid var(--accent)'
          : '1px solid var(--border-subtle)',
        borderLeft: accent ? '3px solid var(--accent)' : undefined,
      }}
    >
      <div
        style={{
          color: 'var(--text-secondary)',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </div>
      <div className="flex items-baseline gap-1" style={{ marginTop: 4 }}>
        <span
          style={{
            color: accent ? 'var(--accent)' : 'var(--text-primary)',
            fontWeight: 700,
            fontSize: 18,
          }}
        >
          {value}
        </span>
        {suffix && (
          <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
            {suffix}
          </span>
        )}
        {waveform && (
          <div className="ml-auto flex h-4 items-end gap-1">
            <div
              className="waveform-bar w-1 rounded-full bg-primary"
              style={{ animationDelay: '0.1s' }}
            />
            <div
              className="waveform-bar w-1 rounded-full bg-primary"
              style={{ animationDelay: '0.3s' }}
            />
            <div
              className="waveform-bar w-1 rounded-full bg-primary"
              style={{ animationDelay: '0.2s' }}
            />
          </div>
        )}
      </div>
      {delta && (
        <div
          style={{
            color:
              delta.tone === 'ok'
                ? 'var(--accent)'
                : delta.tone === 'warn'
                ? 'var(--tone-danger)'
                : 'var(--text-secondary)',
            fontSize: 11,
            marginTop: 2,
          }}
        >
          {delta.value}
        </div>
      )}
    </div>
  );
}

export function KpiPanel() {
  const agentSession = useCtiStore((s) => s.agentSession);
  const queues = useCtiStore((s) => s.queues);
  const activeCalls = useCtiStore((s) => s.activeCalls);

  const totalWaiting = queues.reduce((sum, q) => sum + (q.waitingCount ?? 0), 0);
  const totalTalking = activeCalls.filter((c) => c.sessionStatus === 'TALKING').length;
  const avgTalk =
    agentSession && agentSession.todayAnswered > 0
      ? Math.round((agentSession.todayTalkSeconds ?? 0) / agentSession.todayAnswered)
      : 0;

  return (
    <section className="flex flex-col gap-2">
      <KpiTile label="오늘 응대 건수" value={agentSession?.todayAnswered ?? 0} />
      <KpiTile label="평균 통화 시간" value={formatSeconds(avgTalk)} suffix="분" />
      <KpiTile
        label="현재 대기"
        value={String(totalWaiting).padStart(2, '0')}
        accent
        waveform
      />
      <KpiTile
        label="현재 통화"
        value={String(totalTalking).padStart(2, '0')}
        delta={totalTalking > 5 ? { value: '혼잡', tone: 'warn' } : undefined}
      />
    </section>
  );
}
