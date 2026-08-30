import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdatePacketCaptureSettingsDto {
  @ApiProperty({ description: '테넌트 단위 패킷 캡처 사용 여부' })
  @IsBoolean()
  enabled!: boolean;
}
