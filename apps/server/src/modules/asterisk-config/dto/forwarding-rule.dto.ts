import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const FORWARD_TYPES = ['EXTENSION', 'QUEUE'] as const;
const CONDITION_TYPES = ['ALWAYS', 'TIME_RANGE'] as const;
const WEEKDAY_CODES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export class CreateForwardingRuleDto {
  @IsUUID()
  didId: string;

  @IsIn(FORWARD_TYPES)
  forwardType: string;

  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'targetValue must contain only letters, numbers, underscore, or hyphen' })
  targetValue: string;

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
}

export class UpdateForwardingRuleDto extends CreateForwardingRuleDto {}
