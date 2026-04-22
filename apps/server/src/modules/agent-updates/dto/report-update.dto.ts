import { IsObject, IsOptional, IsString } from 'class-validator';

export class ReportUpdateDto {
  @IsString()
  eventType: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  currentAppVersion?: string;

  @IsOptional()
  @IsString()
  targetVersion?: string;

  @IsOptional()
  @IsString()
  artifactId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
