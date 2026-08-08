import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListCallsQueryDto {
  @ApiPropertyOptional()
  @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() agentId?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() branchId?: string;
  @ApiPropertyOptional({ enum: ['ENDED', 'QUEUED', 'TALKING', 'AFTER_CALL_WORK', 'RINGING_AGENT'] })
  @IsOptional() @IsIn(['ENDED', 'QUEUED', 'TALKING', 'AFTER_CALL_WORK', 'RINGING_AGENT']) status?: string;
  @ApiPropertyOptional({ enum: ['missed', 'all'] })
  @IsOptional() @IsIn(['missed', 'all']) mode?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() resultCode?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() queueName?: string;
  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional() @IsIn(['true', 'false']) abandon?: string;
  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional() @IsIn(['true', 'false']) recording?: string;
  @ApiPropertyOptional({ enum: ['inbound', 'outbound', 'internal'] })
  @IsOptional() @IsIn(['inbound', 'outbound', 'internal']) direction?: string;
  @ApiPropertyOptional({ description: '발신자/수신자 번호 부분 검색' })
  @IsOptional() @IsString() remoteNumber?: string;
  @ApiPropertyOptional({ enum: ['I', 'O', 'N', 'A', 'M', 'C', 'R', 'IT', 'OT'] })
  @IsOptional() @IsIn(['I', 'O', 'N', 'A', 'M', 'C', 'R', 'IT', 'OT']) callType?: string;
  @ApiPropertyOptional({ description: '반환 건수. 기본 500, 최대 1000' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) limit?: number;
}
