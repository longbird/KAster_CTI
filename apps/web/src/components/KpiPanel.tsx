import {
  ClockCircleOutlined,
  PhoneOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { Card } from 'antd';
import { useCtiStore } from '../store/useCtiStore';

function formatSeconds(sec: number): string {
  if (!sec || sec <= 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface KpiTileProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  suffix?: string;
  tone: 'blue' | 'amber' | 'emerald' | 'rose';
}

function KpiTile({ icon, label, value, suffix, tone }: KpiTileProps) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
  } as const;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200/60 bg-white p-3">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-lg border ${tones[tone]}`}
      >
        <span className="text-lg">{icon}</span>
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {label}
        </div>
        <div className="text-xl font-semibold text-slate-800">
          {value}
          {suffix && <span className="ml-1 text-sm font-medium text-slate-400">{suffix}</span>}
        </div>
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
    <Card
      className="rounded-2xl border border-slate-200/70 shadow-sm"
      bodyStyle={{ padding: 16 }}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile
          icon={<TrophyOutlined />}
          label="오늘 응답"
          value={agentSession?.todayAnswered ?? 0}
          suffix="건"
          tone="emerald"
        />
        <KpiTile
          icon={<ClockCircleOutlined />}
          label="오늘 평균 통화"
          value={formatSeconds(avgTalk)}
          tone="blue"
        />
        <KpiTile
          icon={<ThunderboltOutlined />}
          label="현재 대기"
          value={totalWaiting}
          suffix="건"
          tone="amber"
        />
        <KpiTile
          icon={<PhoneOutlined />}
          label="현재 통화"
          value={totalTalking}
          suffix="건"
          tone="rose"
        />
      </div>
    </Card>
  );
}
