import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAnnouncementDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(4000)
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  authorName?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsIn(['NOTICE', 'UPDATE'])
  category?: string;

  @IsOptional()
  @IsIn(['ADMIN', 'AGENT', 'ALL'])
  targetApp?: string;

  @IsOptional()
  @IsBoolean()
  showOnLogin?: boolean;

  @IsOptional()
  @IsIn(['INFO', 'IMPORTANT', 'CRITICAL'])
  severity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  releaseTag?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
