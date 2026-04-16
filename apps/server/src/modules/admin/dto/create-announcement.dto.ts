import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAnnouncementDto {
  @ApiProperty({ example: '시스템 점검 안내' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: '금일 22:00부터 22:30까지 점검이 예정되어 있습니다.' })
  @IsString()
  @MaxLength(4000)
  body!: string;

  @ApiProperty({ required: false, example: '관리자' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  authorName?: string;

  @ApiProperty({ required: false, example: false })
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}
