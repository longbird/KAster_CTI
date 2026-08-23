import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { IsUuidFormat } from '../../../common/decorators/is-uuid-format.decorator';

export class CreateCustomerDto {
  @IsString()
  customerName!: string;

  @IsString()
  primaryPhoneNumber!: string;

  @IsOptional()
  @IsIn(['NORMAL', 'VIP', 'BLACK'])
  grade?: 'NORMAL' | 'VIP' | 'BLACK';

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @IsUuidFormat()
  shareRuleId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  extraPhoneNumbers?: string[];
}
