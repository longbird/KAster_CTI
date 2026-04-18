import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class MuteCallDto {
  @ApiPropertyOptional({ enum: ['on', 'off'], default: 'on' })
  @IsOptional()
  @IsString()
  @IsIn(['on', 'off'])
  state?: 'on' | 'off';

  @ApiPropertyOptional({ enum: ['in', 'out', 'all'], default: 'all' })
  @IsOptional()
  @IsString()
  @IsIn(['in', 'out', 'all'])
  direction?: 'in' | 'out' | 'all';
}
