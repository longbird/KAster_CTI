import { IsIn, IsOptional, IsString } from 'class-validator';

export class CustomerListQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsIn(['NORMAL', 'VIP', 'BLACK'])
  grade?: 'NORMAL' | 'VIP' | 'BLACK';

  @IsOptional()
  @IsString()
  registeredFrom?: string;

  @IsOptional()
  @IsString()
  registeredTo?: string;

  @IsOptional()
  @IsString()
  lastCalledFrom?: string;

  @IsOptional()
  @IsString()
  lastCalledTo?: string;
}
