export type AgentStatusCode =
  | 'AVAILABLE'
  | 'RINGING'
  | 'TALKING'
  | 'AFTER_CALL_WORK'
  | 'BREAK'
  | 'MEAL'
  | 'TRAINING'
  | 'MANUAL_PAUSED';

export type SessionStatus =
  | 'NEW'
  | 'IVR'
  | 'QUEUED'
  | 'RINGING_AGENT'
  | 'TALKING'
  | 'HOLD'
  | 'TRANSFERRING'
  | 'AFTER_CALL_WORK'
  | 'ENDED';

export interface AgentSession {
  agentId: string;
  agentName: string;
  extension: string;
  statusCode: AgentStatusCode;
  todayAnswered: number;
  todayMissed: number;
  todayTalkSeconds: number;
}

export interface QueueSummary {
  queueId: string;
  queueName: string;
  waitingCount: number;
  talkingCount: number;
  availableAgents: number;
  longestWaitSeconds: number;
}

export interface Customer {
  customerId: string;
  customerName: string;
  grade: 'VIP' | 'GOLD' | 'NORMAL';
  phoneNumber: string;
  companyName?: string;
  memo?: string;
  recentOrders?: string[];
}

export interface ActiveCall {
  callId: string;
  linkedid: string;
  ani: string;
  dnis: string;
  queueName: string;
  sessionStatus: SessionStatus;
  startedAt: string;
  queuedAt?: string;
  answeredAt?: string;
  primaryAgentId?: string;
  customer?: Customer;
  memo?: string;
  resultCode?: string;
}

export interface CallHistoryItem {
  callId: string;
  customerName: string;
  phoneNumber: string;
  resultCode: string;
  startedAt: string;
  talkSeconds: number;
  queueName: string;
}

export interface ScreenPopPayload {
  callId: string;
  customer: Customer;
}

export type CtiEvent =
  | { type: 'call.created'; payload: ActiveCall }
  | { type: 'call.updated'; payload: ActiveCall }
  | { type: 'call.ended'; payload: { callId: string; endedAt: string; talkSeconds: number } }
  | { type: 'screenpop.customer'; payload: ScreenPopPayload }
  | { type: 'agent.status.changed'; payload: { agentId: string; statusCode: AgentStatusCode } }
  | { type: 'queue.summary.updated'; payload: QueueSummary[] };

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error: string | null;
}

export interface EventLogItem {
  id: string;
  timestamp: string;
  type:
    | 'call.created'
    | 'call.updated'
    | 'call.ended'
    | 'screenpop.customer'
    | 'agent.status.changed'
    | 'queue.summary.updated'
    | 'info';
  message: string;
}
