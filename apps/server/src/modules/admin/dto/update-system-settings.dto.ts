import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const DATE_FORMATS = ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD', 'YYYY.MM.DD HH:mm'] as const;

export class UpdateSystemSettingsDto {
  @IsBoolean()
  recordingEnabled: boolean;

  @IsInt()
  @Min(5)
  @Max(600)
  defaultMaxWaitSeconds: number;

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
