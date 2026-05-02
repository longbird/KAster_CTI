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
  latestTransfer?: {
    phase: string;
    toExtension?: string;
    requestedAt?: string;
    completedAt?: string | null;
    expiredAt?: string | null;
  } | null;
  customer?: Customer;
  resultCode?: string;
  isMuted?: boolean;
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
  | { type: 'queue.summary.updated'; payload: QueueSummary[] }
  | {
      type: 'runtime.connection.changed';
      payload: {
        state: 'connected' | 'reconnecting' | 'disconnected' | 'error';
        reason?: string;
      };
    };

export interface CommandAck {
  accepted: boolean;
  requestedAt: string;
  correlationId: string;
  idempotencyKey?: string | null;
}
