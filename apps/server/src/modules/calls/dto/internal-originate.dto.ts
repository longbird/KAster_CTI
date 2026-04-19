import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class InternalOriginateDto {
  @ApiProperty()
  @IsString()
  targetExtension: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  targetAgentId?: string;
}
