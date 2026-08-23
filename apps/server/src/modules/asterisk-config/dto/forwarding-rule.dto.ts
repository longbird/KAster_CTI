import {
  ArrayMaxSize,
  IsBoolean,
  IsArray,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Max,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsUuidFormat } from '../../../common/decorators/is-uuid-format.decorator';
import { Type } from 'class-transformer';

const FORWARD_TYPES = ['EXTENSION', 'QUEUE', 'EXTERNAL_NUMBER'] as const;
const CONDITION_TYPES = ['ALWAYS', 'TIME_RANGE'] as const;
const TRIGGER_MODES = ['IMMEDIATE', 'AFTER_QUEUE_WAIT', 'SMART_NO_READY'] as const;
const WEEKDAY_CODES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

class ForwardingScheduleDto {
  @IsIn(CONDITION_TYPES)
  conditionType: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'timeStart must be in HH:mm format' })
  timeStart?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'timeEnd must be in HH:mm format' })
  timeEnd?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsIn(WEEKDAY_CODES, { each: true })
  daysOfWeek?: string[];
}

export class CreateForwardingRuleDto {
  @IsUuidFormat()
  didId: string;

  @IsIn(FORWARD_TYPES)
  forwardType: string;

  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_+\-.]+$/, { message: 'targetValue contains unsupported characters' })
  targetValue: string;

  @IsOptional()
  @IsIn(TRIGGER_MODES)
  forwardTriggerMode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(600)
  queueWaitSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  stickyCallbackWindowMinutes?: number;

  @IsOptional()
  @IsIn(CONDITION_TYPES)
  conditionType?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'timeStart must be in HH:mm format' })
  timeStart?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'timeEnd must be in HH:mm format' })
  timeEnd?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsIn(WEEKDAY_CODES, { each: true })
  daysOfWeek?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ForwardingScheduleDto)
  schedules?: ForwardingScheduleDto[];
}

export class UpdateForwardingRuleDto extends CreateForwardingRuleDto {}
