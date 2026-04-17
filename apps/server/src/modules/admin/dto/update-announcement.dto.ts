import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAnnouncementDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(4000)
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  authorName?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}
