import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

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
}
