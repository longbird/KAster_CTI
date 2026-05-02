import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty()
  @IsString()
  loginId: string;

  @ApiProperty()
  @IsString()
  password: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  extension?: string;

  @ApiPropertyOptional({
    enum: ['web', 'desktop'],
    description: 'Desktop 런타임 로그인일 때만 SIP credential 포함 세션을 반환한다.',
  })
  @IsOptional()
  @IsIn(['web', 'desktop'])
  clientType?: 'web' | 'desktop';
}
