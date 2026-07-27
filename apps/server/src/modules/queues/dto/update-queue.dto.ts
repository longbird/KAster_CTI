import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { QueueOverflowRuleDto } from './queue-overflow-rule.dto';
import { QueueMemberItemDto } from './set-queue-members.dto';

const STRATEGIES = ['rrmemory', 'leastrecent', 'fewestcalls', 'random', 'linear'] as const;
const DISTRIBUTION_MODES = ['SEQUENTIAL', 'DISTRIBUTE', 'UNCONDITIONAL'] as const;
const UNCONDITIONAL_TARGET_TYPES = ['AGENT', 'QUEUE', 'EXTERNAL_NUMBER'] as const;

export class UpdateQueueDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  queueDisplayName?: string;

  @IsOptional()
  @IsIn(STRATEGIES)
  strategy?: string;

  @IsOptional()
  @IsIn(DISTRIBUTION_MODES)
  distributionMode?: string;

  @IsOptional()
  @IsIn(UNCONDITIONAL_TARGET_TYPES)
  unconditionalTargetType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  unconditionalTargetValue?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxWaitSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  ringTimeoutSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  wrapupSeconds?: number;

  @IsOptional()
  @IsBoolean()
  autopause?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QueueMemberItemDto)
  members?: QueueMemberItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QueueOverflowRuleDto)
  overflowRules?: QueueOverflowRuleDto[];
}
