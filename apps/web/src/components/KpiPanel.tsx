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
      className="k-panel p-5"
      style={accent ? { borderLeft: '3px solid var(--signal)' } : undefined}
    >
      <p className="k-eyebrow mb-2" style={accent ? { color: 'var(--signal)' } : undefined}>
        {label}
      </p>
      <div className="flex items-baseline gap-2">
        <span
          className="k-num text-[32px] font-semibold"
          style={{ color: accent ? 'var(--signal)' : 'var(--fg-1)', lineHeight: 1 }}
        >
          {value}
        </span>
        {suffix && <span className="text-[11px] text-[var(--fg-3)]">{suffix}</span>}
        {delta && (
          <span
            className="k-mono text-[11px] font-semibold"
            style={{
              color:
                delta.tone === 'ok'
                  ? 'var(--signal)'
                  : delta.tone === 'warn'
                    ? 'var(--accent-danger)'
                    : 'var(--fg-3)',
            }}
          >
            {delta.value}
          </span>
        )}
        {waveform && (
          <div className="ml-auto flex h-4 items-end gap-1">
            <div className="waveform-bar w-1 rounded-sm" style={{ background: 'var(--signal)', animationDelay: '0.1s' }} />
            <div className="waveform-bar w-1 rounded-sm" style={{ background: 'var(--signal)', animationDelay: '0.3s' }} />
            <div className="waveform-bar w-1 rounded-sm" style={{ background: 'var(--signal)', animationDelay: '0.2s' }} />
          </div>
        )}
      </div>
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
    <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <KpiTile label="오늘 응대 건수" value={agentSession?.todayAnswered ?? 0} />
      <KpiTile label="평균 통화 시간" value={formatSeconds(avgTalk)} suffix="분" />
      <KpiTile label="현재 대기" value={String(totalWaiting).padStart(2, '0')} accent waveform />
      <KpiTile
        label="현재 통화"
        value={String(totalTalking).padStart(2, '0')}
        delta={totalTalking > 5 ? { value: '혼잡', tone: 'warn' } : undefined}
      />
    </section>
  );
}
