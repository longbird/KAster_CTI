import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAnnouncementDto {
  @ApiProperty({ example: '시스템 점검 안내' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: '금일 22:00부터 22:30까지 점검이 예정되어 있습니다.' })
  @IsString()
  @MaxLength(4000)
  body!: string;

  @ApiProperty({ required: false, example: '관리자' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  authorName?: string;

  @ApiProperty({ required: false, example: false })
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiProperty({ required: false, example: 'NOTICE', enum: ['NOTICE', 'UPDATE'] })
  @IsOptional()
  @IsIn(['NOTICE', 'UPDATE'])
  category?: string;

  @ApiProperty({ required: false, example: 'ADMIN', enum: ['ADMIN', 'AGENT', 'ALL'] })
  @IsOptional()
  @IsIn(['ADMIN', 'AGENT', 'ALL'])
  targetApp?: string;

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  showOnLogin?: boolean;

  @ApiProperty({ required: false, example: 'INFO', enum: ['INFO', 'IMPORTANT', 'CRITICAL'] })
  @IsOptional()
  @IsIn(['INFO', 'IMPORTANT', 'CRITICAL'])
  severity?: string;

  @ApiProperty({ required: false, example: '2026.08.03' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  releaseTag?: string;

  @ApiProperty({ required: false, example: '2026-08-03T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiProperty({ required: false, example: '2026-08-10T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
