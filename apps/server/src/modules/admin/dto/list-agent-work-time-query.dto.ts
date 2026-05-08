import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export type AgentWorkTimeGranularity = 'hour' | 'half_hour' | 'day';
export type AgentWorkTimeGroupBy = 'agent' | 'group';

export class ListAgentWorkTimeQueryDto {
  @ApiPropertyOptional()
  @IsDateString()
  from!: string;

  @ApiPropertyOptional()
  @IsDateString()
  to!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentGroupId?: string;

  @ApiPropertyOptional({ enum: ['hour', 'half_hour', 'day'], default: 'hour' })
  @IsOptional()
  @IsIn(['hour', 'half_hour', 'day'])
  granularity?: AgentWorkTimeGranularity;

  @ApiPropertyOptional({ enum: ['agent', 'group'], default: 'agent' })
  @IsOptional()
  @IsIn(['agent', 'group'])
  groupBy?: AgentWorkTimeGroupBy;
}
