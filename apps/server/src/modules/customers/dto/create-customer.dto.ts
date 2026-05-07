import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

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
  @IsUUID()
  shareRuleId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  extraPhoneNumbers?: string[];
}
