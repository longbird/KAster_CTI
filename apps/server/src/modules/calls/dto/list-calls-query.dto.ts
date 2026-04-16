import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class ListCallsQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() agentId?: string;
  @IsOptional() @IsIn(['ENDED', 'QUEUED', 'TALKING', 'AFTER_CALL_WORK', 'RINGING_AGENT']) status?: string;
  @IsOptional() @IsIn(['missed', 'all']) mode?: string;
}
