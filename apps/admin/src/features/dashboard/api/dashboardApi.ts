import { apiClient } from '../../../shared/lib/apiClient';
import type {
  ActiveCallItem,
  AgentTeamSummaryItem,
  AlertItem,
  DashboardData,
  HourlyTrafficItem,
  KpiItem,
  QueueSummaryItem,
} from '../types/dashboard';

// ---- Real path: /admin/dashboard + /calls/active ---------------------------
async function fetchReal(branchId?: string): Promise<DashboardData> {
  const [dashboardRes, activeCallsRes] = await Promise.all([
    apiClient.get('/admin/dashboard', { params: { branchId } }),
    apiClient.get('/calls/active', { params: { branchId } }),
  ]);

  const dashboard = dashboardRes.data?.data;
  const rawActive: any[] = activeCallsRes.data?.data ?? [];

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
    slaBreached: 0,
  }));

  // ── KPI ─────────────────────────────────────────────────────────────────
  const totals = queues.reduce(
    (acc, q) => ({
      waiting: acc.waiting + q.waiting,
      talking: acc.talking + q.talking,
      available: acc.available + q.availableAgents,
    }),
    { waiting: 0, talking: 0, available: 0 },
  );

  const kpis: KpiItem[] = [
    { key: 'waiting', label: '대기 중', value: String(totals.waiting), delta: '', trend: 'flat' },
    { key: 'live', label: '통화 중', value: String(totals.talking), delta: '', trend: 'flat' },
    { key: 'agents', label: '가용 상담원', value: String(totals.available), delta: '', trend: 'flat' },
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
    activeCalls,
    alerts,
    traffic,
  };
}

export const fetchDashboardData = fetchReal;
