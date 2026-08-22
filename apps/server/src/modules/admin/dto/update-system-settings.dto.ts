import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  MAX_AGENT_OFFER_TIMEOUT_SECONDS,
  MIN_AGENT_OFFER_TIMEOUT_SECONDS,
} from '../../../common/call-routing.constants';

const DATE_FORMATS = ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD', 'YYYY.MM.DD HH:mm'] as const;
const RECORDING_CHANNEL_MODES = ['MONO', 'STEREO_RAW'] as const;

export class UpdateSystemSettingsDto {
  @IsBoolean()
  recordingEnabled: boolean;

  @IsOptional()
  @IsString()
  @IsIn(RECORDING_CHANNEL_MODES)
  recordingChannelMode?: typeof RECORDING_CHANNEL_MODES[number];

  @IsInt()
  @Min(5)
  @Max(600)
  defaultMaxWaitSeconds: number;

  // 범위를 상수로 거는 이유: 롱폴 검증 범위와 갈리면 여기서 통과한 값이 AGI 요청에서
  // 거부되고, AGI 는 실패하면 ACCEPT 로 fail-open 한다 — 전 상담원이 자동 수락된다.
  // 값을 안 보낸 저장은 기존 값을 유지한다 (다른 설정 저장이 대기 시간을 되돌리지 않게).
  @IsOptional()
  @IsInt()
  @Min(MIN_AGENT_OFFER_TIMEOUT_SECONDS)
  @Max(MAX_AGENT_OFFER_TIMEOUT_SECONDS)
  agentOfferTimeoutSeconds?: number;

  @IsBoolean()
  allowDirectSipDial: boolean;

  @IsOptional()
  @IsString()
  defaultSipPassword?: string;

  @IsOptional()
  @IsString()
  allowedOutboundCallerIds?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  defaultOutboundCallerId?: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  sipRegisterPort: number;

  @IsString()
  @MaxLength(64)
  timezone: string;

  @IsString()
  @IsIn(DATE_FORMATS)
  dateFormat: string;
}
