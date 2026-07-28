import { apiClient } from '../../../shared/lib/apiClient';
import type {
  ActiveCallItem,
  AgentStatusSummaryItem,
  AgentTeamSummaryItem,
  AlertItem,
  DashboardData,
  HourlyTrafficItem,
  KpiItem,
  QueueSummaryItem,
} from '../types/dashboard';

const AGENT_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: '대기',
  RINGING: '호출',
  TALKING: '통화',
  AFTER_CALL_WORK: '후처리',
  BREAK: '휴식',
  MEAL: '식사',
  TRAINING: '교육',
  MANUAL_PAUSED: '중지',
};
const AGENT_STATUS_ORDER = [
  'AVAILABLE',
  'RINGING',
  'TALKING',
  'AFTER_CALL_WORK',
  'BREAK',
  'MEAL',
  'TRAINING',
  'MANUAL_PAUSED',
];

export function mapDashboardPayload(dashboard: any, rawActive: any[]): DashboardData {
  // ── 큐 요약 ─────────────────────────────────────────────────────────────
  const queues: QueueSummaryItem[] = (dashboard?.queues ?? []).map((q: any) => ({
    queueName: q.queueDisplayName ?? q.queueName,
    waiting: q.waiting ?? 0,
    talking: q.talking ?? 0,
    availableAgents: q.available ?? 0,
    longestWaitSec: q.longestWaitSeconds ?? 0,
    answerRate:
      (q.recentAnswered ?? 0) + (q.recentAbandoned ?? 0) > 0
        ? Math.round((q.recentAnswered / (q.recentAnswered + q.recentAbandoned)) * 100)
        : 0,
    abandoned: q.recentAbandoned ?? 0,
    slaBreached: q.virtualBuffer?.overThresholdCalls ?? 0,
    virtualBuffer: q.virtualBuffer,
  }));

  // ── KPI ─────────────────────────────────────────────────────────────────
  const totals = queues.reduce(
    (acc, q) => ({
      waiting: acc.waiting + q.waiting,
      talking: acc.talking + q.talking,
    }),
    { waiting: 0, talking: 0 },
  );
  const idleAgents = dashboard?.agentStatusDistribution?.AVAILABLE ?? 0;
  const statusDistribution = dashboard?.agentStatusDistribution ?? {};
  const agentStatuses: AgentStatusSummaryItem[] = AGENT_STATUS_ORDER.map((statusCode) => ({
    statusCode,
    label: AGENT_STATUS_LABELS[statusCode] ?? statusCode,
    count: statusDistribution[statusCode] ?? 0,
  })).filter((item) => item.count > 0 || ['AVAILABLE', 'TALKING', 'AFTER_CALL_WORK', 'BREAK'].includes(item.statusCode));

  const kpis: KpiItem[] = [
    { key: 'waiting', label: '대기 콜', value: String(totals.waiting), delta: '', trend: 'flat' },
    { key: 'live', label: '통화 중', value: String(totals.talking), delta: '', trend: 'flat' },
    { key: 'idle-agents', label: '대기 상담원', value: String(idleAgents), delta: '', trend: 'flat' },
    { key: 'today', label: '오늘 응답', value: String(dashboard?.today?.answered ?? 0), delta: '', trend: 'flat' },
    { key: 'abandon', label: '오늘 포기', value: String(dashboard?.today?.abandoned ?? 0), delta: '', trend: 'flat' },
  ];

  // ── 활성 콜 ──────────────────────────────────────────────────────────────
  const activeCalls: ActiveCallItem[] = rawActive.map((c: any) => ({
    id: c.callId,
    queueName: c.queueName ?? '',
    agentName: c.agentName || c.primaryAgentId || '',   // agentName 은 백엔드 enriched 필드
    customerPhone: c.ani ?? '',
    direction: c.direction === 'outbound' ? 'outbound' : 'inbound',
    waitingSec: c.waitSeconds ?? 0,
    talkingSec: c.talkSeconds ?? 0,
    status: (c.sessionStatus ?? 'TALKING') as any,
  }));

  // ── 팀 현황 (백엔드 teams 필드) ──────────────────────────────────────────
  const teams: AgentTeamSummaryItem[] = (dashboard?.teams ?? []).map((t: any) => ({
    teamName: t.teamName,
    available: t.available ?? 0,
    ringing: t.ringing ?? 0,
    talking: t.talking ?? 0,
    acw: t.acw ?? 0,
    break: t.break ?? 0,
  }));

  // ── 시간대별 트래픽 (백엔드 traffic 필드) ────────────────────────────────
  const traffic: HourlyTrafficItem[] = (dashboard?.traffic ?? []).map((t: any) => ({
    hour: t.hour,
    inbound: t.inbound ?? 0,
    answered: t.answered ?? 0,
    abandoned: t.abandoned ?? 0,
  }));

  // ── 알람 (백엔드 alerts 필드) ────────────────────────────────────────────
  const alerts: AlertItem[] = (dashboard?.alerts ?? []).map((a: any) => ({
    id: a.id,
    level: a.level as 'info' | 'warning' | 'error',
    message: a.message,
    time: a.time ?? '방금 전',
  }));

  return {
    updatedAt: dashboard?.generatedAt ?? new Date().toISOString(),
    kpis,
    queues,
    teams,
    agentStatuses,
    activeCalls,
    alerts,
    traffic,
  };
}

// ---- Real path: /admin/dashboard + /calls/active ---------------------------
async function fetchReal(branchId?: string): Promise<DashboardData> {
  const [dashboardRes, activeCallsRes] = await Promise.all([
    apiClient.get('/admin/dashboard', { params: { branchId } }),
    apiClient.get('/calls/active', { params: { branchId, limit: 500 } }),
  ]);

  return mapDashboardPayload(dashboardRes.data?.data, activeCallsRes.data?.data ?? []);
}

export const fetchDashboardData = fetchReal;
