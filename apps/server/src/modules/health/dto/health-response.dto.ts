import { ApiProperty } from '@nestjs/swagger';

class InfraChecksDto {
  @ApiProperty({ example: 'up' })
  db!: 'up' | 'down';

  @ApiProperty({ example: 'up' })
  redis!: 'up' | 'down' | 'degraded';

  @ApiProperty({ example: 'connected' })
  ami!: 'connected' | 'disconnected';
}

class CallHealthDto {
  @ApiProperty({ example: 23 })
  active!: number;

  @ApiProperty({ example: 6 })
  queued!: number;

  @ApiProperty({ example: 3 })
  ringing!: number;

  @ApiProperty({ example: 11 })
  talking!: number;

  @ApiProperty({ example: 1 })
  hold!: number;

  @ApiProperty({ example: 2 })
  transferring!: number;

  @ApiProperty({ example: 1 })
  stuck!: number;

  @ApiProperty({ example: 42 })
  longestWaitingSeconds!: number;
}

class AgentHealthDto {
  @ApiProperty({ example: 12 })
  available!: number;

  @ApiProperty({ example: 10 })
  talking!: number;

  @ApiProperty({ example: 2 })
  ringing!: number;

  @ApiProperty({ example: 5 })
  paused!: number;

  @ApiProperty({ example: 29 })
  loggedIn!: number;
}

class QueueHealthDto {
  @ApiProperty({ example: 6 })
  waiting!: number;

  @ApiProperty({ example: 3 })
  ringing!: number;

  @ApiProperty({ example: 11 })
  talking!: number;

  @ApiProperty({ example: 10 })
  availableAgents!: number;

  @ApiProperty({ example: 42 })
  longestWaitSeconds!: number;
}

class ResilienceMetricsDto {
  @ApiProperty({ example: '12', nullable: true })
  lkgVersion!: string | null;

  @ApiProperty({ example: 42, nullable: true })
  lkgAgeSeconds!: number | null;

  @ApiProperty({ example: 0 })
  offlineEventQueueDepth!: number;

  @ApiProperty({ example: null, nullable: true, description: '명령 스풀 미구현. null = 미지원' })
  offlineCommandQueueDepth!: number | null;

  @ApiProperty({ example: 0 })
  configVersionMismatch!: number;

  @ApiProperty({ example: 'primary' })
  dbRole!: 'primary' | 'standby' | 'unknown';

  @ApiProperty({ example: null, nullable: true })
  replicationLagSeconds!: number | null;

  @ApiProperty({ example: 12, nullable: true })
  walArchiveAgeSeconds!: number | null;

  @ApiProperty({ example: null, nullable: true })
  backupLastSuccessTimestamp!: string | null;
}

class DataFreshnessDto {
  @ApiProperty({ example: 'fresh' })
  db!: 'fresh' | 'stale' | 'unavailable';

  @ApiProperty({ example: 'fresh' })
  config!: 'fresh' | 'lkg' | 'missing';

  @ApiProperty({ example: 'fresh' })
  customer!: 'fresh' | 'cache-only' | 'unavailable';
}

class OperatingRestrictionsDto {
  @ApiProperty({ example: true })
  allowExistingCallControl!: boolean;

  @ApiProperty({ example: true })
  allowGeneralConfigWrites!: boolean;

  @ApiProperty({ example: true })
  allowEmergencyConfigWrites!: boolean;

  @ApiProperty({ example: true })
  allowNewLogin!: boolean;

  @ApiProperty({ example: true })
  allowCustomerCacheMissLookup!: boolean;
}

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok' | 'degraded' | 'down';

  @ApiProperty({ example: '2026-04-16T00:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: 'cti-app-1' })
  instanceId!: string;

  @ApiProperty({ example: true })
  leader!: boolean;

  @ApiProperty({ type: InfraChecksDto })
  checks!: InfraChecksDto;

  @ApiProperty({ type: CallHealthDto })
  call!: CallHealthDto;

  @ApiProperty({ type: AgentHealthDto })
  agent!: AgentHealthDto;

  @ApiProperty({ type: QueueHealthDto })
  queue!: QueueHealthDto;

  @ApiProperty({ example: 'NORMAL' })
  operatingMode!: 'NORMAL' | 'DB_FAILOVER' | 'DEGRADED' | 'RECOVERING';

  @ApiProperty({ type: DataFreshnessDto })
  dataFreshness!: DataFreshnessDto;

  @ApiProperty({ type: OperatingRestrictionsDto })
  restrictions!: OperatingRestrictionsDto;

  @ApiProperty({ type: ResilienceMetricsDto })
  resilience!: ResilienceMetricsDto;
}
