import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateTrunkDto {
  @IsString() name: string;
  @IsString() host: string;
  @IsOptional() @IsInt() @Min(1) port?: number;
  @IsString() username: string;
  @IsString() password: string;
  @IsString() fromDomain: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9,]+$/, { message: 'codecs must be comma-separated codec names (e.g. alaw,ulaw)' }) codecs?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateTrunkDto extends CreateTrunkDto {}
