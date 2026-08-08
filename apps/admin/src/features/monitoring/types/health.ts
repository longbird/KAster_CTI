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

export type OperatingMode = 'NORMAL' | 'DB_FAILOVER' | 'DEGRADED' | 'RECOVERING';

export interface DataFreshness {
  db: 'fresh' | 'stale' | 'unavailable';
  config: 'fresh' | 'lkg' | 'missing';
  customer: 'fresh' | 'cache-only' | 'unavailable';
}

export interface OperatingRestrictions {
  allowExistingCallControl: boolean;
  allowGeneralConfigWrites: boolean;
  allowEmergencyConfigWrites: boolean;
  allowNewLogin: boolean;
  allowCustomerCacheMissLookup: boolean;
}

export interface ResilienceMetrics {
  lkgVersion: string | null;
  lkgAgeSeconds: number | null;
  offlineEventQueueDepth: number;
  /** null = 명령 스풀 미구현. 0 과 구분해야 한다 */
  offlineCommandQueueDepth: number | null;
  configVersionMismatch: number;
  dbRole: 'primary' | 'standby' | 'unknown';
  replicationLagSeconds: number | null;
  walArchiveAgeSeconds: number | null;
  backupLastSuccessTimestamp: string | null;
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
  // 구버전 서버와도 화면이 뜨도록 optional 로 둔다.
  operatingMode?: OperatingMode;
  dataFreshness?: DataFreshness;
  restrictions?: OperatingRestrictions;
  resilience?: ResilienceMetrics;
}
