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
      className={`rounded-lg p-6 ${
        accent
          ? 'border-l-4 border-primary bg-surface-container-lowest'
          : 'bg-surface-container-lowest'
      } shadow-panel`}
    >
      <p
        className={`mb-2 text-[10px] font-bold uppercase tracking-widest ${
          accent ? 'text-primary' : 'text-on-surface-variant'
        }`}
      >
        {label}
      </p>
      <div className="flex items-baseline gap-2">
        <span
          className={`font-headline text-3xl font-bold ${accent ? 'text-primary' : 'text-on-surface'}`}
        >
          {value}
        </span>
        {suffix && <span className="text-xs font-medium text-outline">{suffix}</span>}
        {delta && (
          <span
            className={`text-xs font-bold ${
              delta.tone === 'ok'
                ? 'text-tertiary'
                : delta.tone === 'warn'
                ? 'text-error'
                : 'text-outline'
            }`}
          >
            {delta.value}
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
    <section className="grid grid-cols-1 gap-6 md:grid-cols-4">
      <KpiTile label="Today's Answered" value={agentSession?.todayAnswered ?? 0} />
      <KpiTile label="Avg Talk Time" value={formatSeconds(avgTalk)} suffix="min" />
      <KpiTile
        label="Current Waiting"
        value={String(totalWaiting).padStart(2, '0')}
        accent
        waveform
      />
      <KpiTile
        label="Current Calls"
        value={String(totalTalking).padStart(2, '0')}
        delta={totalTalking > 5 ? { value: 'Peak', tone: 'warn' } : undefined}
      />
    </section>
  );
}
