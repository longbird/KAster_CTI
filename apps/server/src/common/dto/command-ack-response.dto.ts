import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CommandAckDto {
  @ApiProperty({ example: true })
  accepted!: boolean;

  @ApiProperty({ example: '2026-04-22T12:00:00.000Z' })
  requestedAt!: string;

  @ApiProperty({ example: 'corr-123' })
  correlationId!: string;

  @ApiPropertyOptional({ example: 'idem-123', nullable: true })
  idempotencyKey?: string | null;
}

export class CommandAckResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: () => CommandAckDto })
  data!: CommandAckDto;

  @ApiPropertyOptional({ nullable: true, type: Object })
  error?: unknown | null;
}
