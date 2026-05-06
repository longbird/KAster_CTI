import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListIvrFailuresQueryDto {
  @ApiPropertyOptional()
  @IsOptional() @IsDateString() from?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString() to?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() branchId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() entryDid?: string;

  @ApiPropertyOptional({ enum: ['INPUT_TIMEOUT', 'INVALID_INPUT', 'FLOW_FAILURE', 'SMS_FAILURE', 'OPT_OUT_FAILURE'] })
  @IsOptional() @IsIn(['INPUT_TIMEOUT', 'INVALID_INPUT', 'FLOW_FAILURE', 'SMS_FAILURE', 'OPT_OUT_FAILURE'])
  reason?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize?: number;
}
