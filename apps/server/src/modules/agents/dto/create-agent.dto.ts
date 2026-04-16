import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const ROLES = ['agent', 'supervisor', 'admin'] as const;

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  loginId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  agentCode: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  agentName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  @Matches(/^\d+$/, { message: '내선번호는 숫자만 허용합니다' })
  extension: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: string;

  @IsOptional()
  @IsUUID()
  defaultQueueId?: string;
}
