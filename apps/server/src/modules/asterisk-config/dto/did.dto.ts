import { IsBoolean, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateDidDto {
  @IsString() @Matches(/^[0-9+_X.!\[\]-]+$/, { message: 'did must be a valid E.164 number or Asterisk extension pattern' }) did: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() ivrMenuId?: string;
  @IsOptional() @IsString() directQueue?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateDidDto extends CreateDidDto {}
