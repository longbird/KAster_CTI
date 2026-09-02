import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePlatformPasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  currentPassword: string;

  // 길이 규칙은 상담원 계정(create-agent.dto)과 같게 둔다. 계정 종류마다 다르면 운영이 헷갈린다.
  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  newPassword: string;
}
