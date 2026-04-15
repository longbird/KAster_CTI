import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ChangeAgentStatusDto {
  @ApiProperty()
  @IsString()
  statusCode: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reasonCode?: string;
}
