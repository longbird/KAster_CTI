import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdatePlatformAdminDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}
