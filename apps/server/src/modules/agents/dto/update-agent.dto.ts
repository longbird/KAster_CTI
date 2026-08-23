import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsUuidFormat } from '../../../common/decorators/is-uuid-format.decorator';

const ROLES = ['agent', 'supervisor', 'admin'] as const;
const EXTENSION_LOCK_MODES = ['UNLOCKED', 'OUTBOUND_LOCKED', 'FULL_LOCKED'] as const;

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  loginId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  agentName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  extension?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  extensionDisplayName?: string | null;

  @IsOptional()
  @IsIn(EXTENSION_LOCK_MODES)
  extensionLockMode?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: string;

  @IsOptional()
  @IsUuidFormat()
  defaultQueueId?: string | null;

  @IsOptional()
  @IsUuidFormat()
  agentGroupId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sipPassword?: string | null;

  @IsOptional()
  @IsObject()
  settingsProfile?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
