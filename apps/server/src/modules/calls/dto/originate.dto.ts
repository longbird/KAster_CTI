import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class OriginateDto {
  @ApiProperty()
  @IsString()
  agentExtension: string;

  @ApiProperty()
  @IsString()
  phoneNumber: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ required: false, description: '허용된 발신번호 목록에 포함된 번호만 사용 가능' })
  @IsOptional()
  @IsString()
  callerId?: string;
}
