import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class PlatformRefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

/** 로그아웃은 멱등이다 — 토큰이 없어도 성공으로 답한다. */
export class PlatformLogoutDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
