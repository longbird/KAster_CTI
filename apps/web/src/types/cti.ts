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
  callControlCapabilities?: {
    muteEnabled: boolean;
    holdEnabled: boolean;
    holdMode: 'feature_code' | 'disabled';
  };
  outboundDialOptions?: {
    allowedCallerIds: string[];
    defaultCallerId: string | null;
  };
  callCapabilities?: CallCapabilities;
}

export interface OutboundDialPermissions {
  phoneDirect: boolean;
  phoneDirectAllowedIps: string[];
  domestic: boolean;
  representative: boolean;
  paid: boolean;
  international: boolean;
}

export interface OutboundDialOptions {
  allowedCallerIds: string[];
  defaultCallerId: string | null;
}

export interface CallCapabilities {
  canOriginateExternal: boolean;
  canOriginateInternal: boolean;
  canUsePhoneDirect: boolean;
  outboundDialPermissions: OutboundDialPermissions;
  outboundDialOptions: OutboundDialOptions;
  disabledReasons: string[];
}

export interface AgentDirectoryItem {
  agentId: string;
  agentName: string;
  extension: string;
  role: string;
  isActive: boolean;
  currentStatus?: {
    statusCode: AgentStatusCode;
    reasonCode?: string | null;
    startedAt?: string;
  } | null;
}

export interface Announcement {
  announcementId: string;
  title: string;
  body: string;
  authorName: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
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
  latestTransfer?: {
    phase: string;
    toExtension?: string;
    requestedAt?: string;
    completedAt?: string | null;
    expiredAt?: string | null;
  } | null;
  customer?: Customer;
  memo?: string;
  resultCode?: string;
  isMuted?: boolean;
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

export interface CommandAck {
  accepted: boolean;
  requestedAt: string;
  correlationId: string;
  idempotencyKey?: string | null;
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
