import { IsBooleanString, IsIn, IsOptional, IsString } from 'class-validator';
import { SMS_TEMPLATE_CATEGORIES } from './create-sms-template.dto';

export class ListSmsTemplatesQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  @IsIn(SMS_TEMPLATE_CATEGORIES)
  category?: (typeof SMS_TEMPLATE_CATEGORIES)[number];

  @IsOptional()
  @IsBooleanString()
  isActive?: string;
}
