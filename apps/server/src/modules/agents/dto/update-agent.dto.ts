import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const ROLES = ['agent', 'supervisor', 'admin'] as const;

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  agentName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  extension?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: string;

  @IsOptional()
  @IsUUID()
  defaultQueueId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
