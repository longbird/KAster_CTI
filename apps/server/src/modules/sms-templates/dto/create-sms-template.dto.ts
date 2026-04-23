import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const SMS_TEMPLATE_CATEGORIES = [
  'OPT_OUT_080',
  'GENERAL_NOTICE',
  'RESERVATION_ALERT',
] as const;

export class CreateSmsTemplateDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  templateName: string;

  @IsString()
  @IsIn(SMS_TEMPLATE_CATEGORIES)
  category: (typeof SMS_TEMPLATE_CATEGORIES)[number];

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
