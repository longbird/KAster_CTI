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
}
