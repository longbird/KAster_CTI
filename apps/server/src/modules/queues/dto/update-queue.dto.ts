import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { QueueOverflowRuleDto } from './queue-overflow-rule.dto';
import { QueueMemberItemDto } from './set-queue-members.dto';
import {
  MAX_AGENT_OFFER_TIMEOUT_SECONDS,
  MIN_AGENT_OFFER_TIMEOUT_SECONDS,
} from '../../../common/call-routing.constants';

const STRATEGIES = ['rrmemory', 'leastrecent', 'fewestcalls', 'random', 'linear', 'ringall'] as const;
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

  /**
   * 상담원에게 "받으시겠습니까" 를 묻고 기다리는 시간(초).
   *
   * 범위는 <b>롱폴 엔드포인트가 받아주는 범위와 같아야 한다.</b> 여기가 더 넓으면 관리자가 저장한
   * 값이 dialplan → AGI 를 타고 서버에 도착했을 때 검증에 걸려 400 이 되고, AGI 는 실패하면
   * ACCEPT 로 열어 버린다 — 전 상담원이 묻지도 않고 자동 수락된다.
   */
  @IsOptional()
  @IsInt()
  @Min(MIN_AGENT_OFFER_TIMEOUT_SECONDS)
  @Max(MAX_AGENT_OFFER_TIMEOUT_SECONDS)
  agentOfferTimeoutSeconds?: number;

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
