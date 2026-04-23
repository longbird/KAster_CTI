import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWebHandoffDto {
  @ApiPropertyOptional({ example: '/desktop-handoff' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  redirectPath?: string;
}
