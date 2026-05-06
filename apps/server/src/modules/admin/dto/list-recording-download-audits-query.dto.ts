import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListRecordingDownloadAuditsQueryDto {
  @ApiPropertyOptional()
  @IsOptional() @IsDateString() from?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString() to?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() branchId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() agentId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() linkedid?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize?: number;
}
