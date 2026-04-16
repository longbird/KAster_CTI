import axios from 'axios';
import { API_BASE_URL, USE_MOCK, ACCESS_TOKEN_KEY } from '../../../config';
import { baseDashboardData } from '../mocks/mockDashboard';
import type {
  ActiveCallItem,
  AgentTeamSummaryItem,
  AlertItem,
  DashboardData,
  HourlyTrafficItem,
  KpiItem,
  QueueSummaryItem,
} from '../types/dashboard';

// ---- Mock path (VITE_USE_MOCK=true) ----------------------------------------
function randomShift(value: number, min: number, max: number) {
  return Math.max(0, value + Math.floor(Math.random() * (max - min + 1)) + min);
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

async function fetchMock(): Promise<DashboardData> {
  await new Promise((resolve) => setTimeout(resolve, 250));
  const next = clone(baseDashboardData);
  next.updatedAt = new Date().toISOString();

  next.queues = next.queues.map((queue) => ({
    ...queue,
    waiting: randomShift(queue.waiting, -1, 2),
    talking: randomShift(queue.talking, -1, 1),
    availableAgents: randomShift(queue.availableAgents, -1, 1),
    longestWaitSec: randomShift(queue.longestWaitSec, -8, 14),
    abandoned: randomShift(queue.abandoned, 0, 1),
    slaBreached: randomShift(queue.slaBreached, -1, 1),
  }));

  next.kpis = next.kpis.map((kpi) => {
    if (kpi.key === 'waiting') return { ...kpi, value: String(next.queues.reduce((sum, q) => sum + q.waiting, 0)) };
    if (kpi.key === 'live') return { ...kpi, value: String(next.queues.reduce((sum, q) => sum + q.talking, 0)) };
    if (kpi.key === 'agents') return { ...kpi, value: String(next.queues.reduce((sum, q) => sum + q.availableAgents, 0)) };
    return kpi;
  });

  next.activeCalls = next.activeCalls.map((call) => ({
    ...call,
    waitingSec: randomShift(call.waitingSec, -4, 7),
    talkingSec:
      call.status === 'TALKING' || call.status === 'TRANSFERRING'
        ? call.talkingSec + randomShift(5, 1, 5)
        : call.talkingSec,
  }));

  return next;
}

// ---- Real path: /admin/dashboard + /calls/active ---------------------------
function readToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function fetchReal(branchId?: string): Promise<DashboardData> {
  const headers: Record<string, string> = {};
  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const [dashboardRes, activeCallsRes] = await Promise.all([
    axios.get(`${API_BASE_URL}/admin/dashboard`, { headers, params: { branchId } }),
    axios.get(`${API_BASE_URL}/calls/active`, { headers, params: { branchId } }),
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

export async function fetchDashboardData(branchId?: string): Promise<DashboardData> {
  if (USE_MOCK) return fetchMock();
  return fetchReal(branchId);
}
