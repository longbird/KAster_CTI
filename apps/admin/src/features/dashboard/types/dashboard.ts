export type AgentStatus = 'AVAILABLE' | 'RINGING' | 'TALKING' | 'AFTER_CALL_WORK' | 'BREAK';

export interface KpiItem {
  key: string;
  label: string;
  value: string;
  delta: string;
  trend: 'up' | 'down' | 'flat';
}

export interface QueueSummaryItem {
  queueName: string;
  waiting: number;
  talking: number;
  availableAgents: number;
  longestWaitSec: number;
  answerRate: number;
  abandoned: number;
  slaBreached: number;
  virtualBuffer?: VirtualBufferStatus;
}

export interface VirtualBufferStatus {
  waitingCalls: number;
  longestWaitSeconds: number;
  overThresholdCalls: number;
  status: 'EMPTY' | 'WAITING' | 'OVER_THRESHOLD';
}

export interface AgentTeamSummaryItem {
  teamName: string;
  available: number;
  ringing: number;
  talking: number;
  acw: number;
  break: number;
}

export interface AgentStatusSummaryItem {
  statusCode: string;
  label: string;
  count: number;
}

export interface ActiveCallItem {
  id: string;
  queueName: string;
  agentName: string;
  customerPhone: string;
  direction: 'inbound' | 'outbound';
  waitingSec: number;
  talkingSec: number;
  status: 'NEW' | 'QUEUED' | 'RINGING_AGENT' | 'TALKING' | 'HOLD' | 'TRANSFERRING' | 'AFTER_CALL_WORK';
}

export interface AlertItem {
  id: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  time: string;
}

export interface HourlyTrafficItem {
  hour: string;
  inbound: number;
  answered: number;
  abandoned: number;
}

export interface DashboardData {
  updatedAt: string;
  kpis: KpiItem[];
  queues: QueueSummaryItem[];
  teams: AgentTeamSummaryItem[];
  agentStatuses: AgentStatusSummaryItem[];
  activeCalls: ActiveCallItem[];
  alerts: AlertItem[];
  traffic: HourlyTrafficItem[];
}
