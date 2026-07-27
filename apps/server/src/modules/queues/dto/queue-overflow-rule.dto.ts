import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const QUEUE_OVERFLOW_TRIGGER_MODES = ['AFTER_WAIT'] as const;
const QUEUE_OVERFLOW_TARGET_TYPES = ['AI_CENTER', 'EXTERNAL_NUMBER', 'QUEUE', 'EXTENSION'] as const;

export class QueueOverflowRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  queueOverflowRuleId?: string;

  @IsOptional()
  @IsIn(QUEUE_OVERFLOW_TRIGGER_MODES)
  triggerMode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  waitSeconds?: number;

  @IsIn(QUEUE_OVERFLOW_TARGET_TYPES)
  targetType: string;

  @IsString()
  @MaxLength(128)
  targetValue: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  resultCode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
