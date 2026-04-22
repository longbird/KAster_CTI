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

export type CtiEvent =
  | { type: 'call.created'; payload: ActiveCall }
  | { type: 'call.updated'; payload: ActiveCall }
  | { type: 'call.ended'; payload: { callId: string; endedAt: string; talkSeconds: number } }
  | { type: 'agent.status.changed'; payload: { agentId: string; statusCode: AgentStatusCode } }
  | { type: 'queue.summary.updated'; payload: QueueSummary[] };

export interface CommandAck {
  accepted: boolean;
  requestedAt: string;
  correlationId: string;
  idempotencyKey?: string | null;
}
