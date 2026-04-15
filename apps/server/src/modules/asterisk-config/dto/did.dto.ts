import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDidDto {
  @IsString() did: string;
  @IsString() @IsOptional() description?: string;
  @IsUUID() @IsOptional() ivrMenuId?: string;
  @IsString() @IsOptional() directQueue?: string;
  @IsBoolean() @IsOptional() enabled?: boolean;
}

export class UpdateDidDto extends CreateDidDto {}
