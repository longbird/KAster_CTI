import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ConsultationDto {
  @ApiProperty({ description: '협의 통화 대상 내선 또는 전화번호' })
  @IsString()
  target: string;
}
