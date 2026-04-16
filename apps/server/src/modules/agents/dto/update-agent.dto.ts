import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  agentName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  extension?: string;
}
