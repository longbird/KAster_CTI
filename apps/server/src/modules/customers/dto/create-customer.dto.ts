import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString } from 'class-validator';

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
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  extraPhoneNumbers?: string[];
}
