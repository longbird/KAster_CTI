import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QueueMemberItemDto } from './set-queue-members.dto';

const STRATEGIES = ['rrmemory', 'leastrecent', 'fewestcalls', 'random', 'linear'] as const;
const DISTRIBUTION_MODES = ['SEQUENTIAL', 'DISTRIBUTE', 'UNCONDITIONAL'] as const;
const UNCONDITIONAL_TARGET_TYPES = ['AGENT', 'QUEUE', 'EXTERNAL_NUMBER'] as const;

export class CreateQueueDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9-]+$/, { message: '큐명은 영소문자·숫자·하이픈만 허용합니다' })
  queueName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Matches(/^\d+$/, { message: '내선번호는 숫자만 허용합니다' })
  queueExten?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  queueDisplayName: string;

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
  @Min(5)
  ringTimeoutSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  wrapupSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxWaitSeconds?: number;

  @IsOptional()
  @IsBoolean()
  autopause?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QueueMemberItemDto)
  members?: QueueMemberItemDto[];
}
