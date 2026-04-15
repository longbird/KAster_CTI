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

// ---- Mock path (VITE_USE_MOCK=true) ---------------------------------------
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

// ---- Real path: /admin/dashboard + /calls/active -------------------------
function readToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function fetchReal(): Promise<DashboardData> {
  const headers: Record<string, string> = {};
  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const [dashboardRes, activeCallsRes] = await Promise.all([
    axios.get(`${API_BASE_URL}/admin/dashboard`, { headers }).catch(() => null),
    axios.get(`${API_BASE_URL}/calls/active`, { headers }).catch(() => null),
  ]);

  const dashboard = dashboardRes?.data?.data;
  const rawActive: any[] = activeCallsRes?.data?.data ?? [];

  const queues: QueueSummaryItem[] = (dashboard?.queues ?? []).map((q: any) => ({
    queueName: q.queueDisplayName ?? q.queueName,
    waiting: q.waiting ?? 0,
    talking: q.talking ?? 0,
    availableAgents: q.available ?? 0,
    longestWaitSec: q.longestWaitSeconds ?? 0,
    answerRate:
      q.recentAnswered && q.recentAnswered + (q.recentAbandoned ?? 0) > 0
        ? Math.round((q.recentAnswered / (q.recentAnswered + q.recentAbandoned)) * 100)
        : 0,
    abandoned: q.recentAbandoned ?? 0,
    slaBreached: 0,
  }));

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

  const activeCalls: ActiveCallItem[] = rawActive.map((c: any) => ({
    id: c.callId,
    queueName: c.queueName ?? '',
    agentName: c.primaryAgentId ?? '',
    customerPhone: c.ani ?? '',
    direction: c.direction === 'outbound' ? 'outbound' : 'inbound',
    waitingSec: c.waitSeconds ?? 0,
    talkingSec: c.talkSeconds ?? 0,
    status: (c.sessionStatus ?? 'TALKING') as any,
  }));

  // 팀/트래픽/알람은 현재 백엔드 응답에 없어 mock 기본값으로 채움. 후속:
  // /admin/dashboard 에 teams/traffic/alerts 응답 확장.
  const teams: AgentTeamSummaryItem[] = baseDashboardData.teams;
  const traffic: HourlyTrafficItem[] = baseDashboardData.traffic;
  const alerts: AlertItem[] = baseDashboardData.alerts;

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

export async function fetchDashboardData(): Promise<DashboardData> {
  try {
    if (USE_MOCK) return await fetchMock();
    return await fetchReal();
  } catch {
    // 인증 실패/서버 꺼짐 같은 상황에서도 화면이 뜨도록 mock 로 폴백.
    return fetchMock();
  }
}
