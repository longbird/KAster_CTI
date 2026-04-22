import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateUpdateSessionDto {
  @ApiPropertyOptional({ example: 'pc-001' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ example: '1.3.2' })
  @IsOptional()
  @IsString()
  currentVersion?: string;
}
