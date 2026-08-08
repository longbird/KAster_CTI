import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetDndDto {
  @ApiProperty({ description: 'true면 수신거부, false면 수신 허용' })
  @IsBoolean()
  enabled: boolean;
}
