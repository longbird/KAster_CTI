import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDidDto {
  @IsString() did: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() ivrMenuId?: string;
  @IsOptional() @IsString() directQueue?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateDidDto extends CreateDidDto {}
