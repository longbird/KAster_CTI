import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateHandoffDto {
  @ApiPropertyOptional({ example: 'front-desk-pc-01' })
  @IsOptional()
  @IsString()
  deviceName?: string;
}
