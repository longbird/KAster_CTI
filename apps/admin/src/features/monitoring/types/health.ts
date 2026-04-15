// apps/admin/src/features/monitoring/types/health.ts
export interface HealthChecks {
  db: 'up' | 'down';
  redis: 'up' | 'down' | 'degraded';
  ami: 'connected' | 'disconnected';
}

export interface CallHealth {
  active: number;
  queued: number;
  ringing: number;
  talking: number;
  hold: number;
  transferring: number;
  stuck: number;
  longestWaitingSeconds: number;
}

export interface AgentHealth {
  available: number;
  talking: number;
  ringing: number;
  paused: number;
  loggedIn: number;
}

export interface QueueHealth {
  waiting: number;
  ringing: number;
  talking: number;
  availableAgents: number;
  longestWaitSeconds: number;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  instanceId: string;
  leader: boolean;
  checks: HealthChecks;
  call: CallHealth;
  agent: AgentHealth;
  queue: QueueHealth;
}
