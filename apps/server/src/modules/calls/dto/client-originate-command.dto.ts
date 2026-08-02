import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ClientOriginateCommandDto {
  @ApiProperty({ description: '클라이언트가 생성한 발신 명령 ID' })
  @IsString()
  commandId: string;

  @ApiProperty({ description: '외부 발신 대상 번호' })
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
