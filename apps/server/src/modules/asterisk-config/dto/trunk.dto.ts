import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateTrunkDto {
  @IsString() name: string;
  @IsString() host: string;
  @IsOptional() @IsInt() @Min(1) port?: number;
  @IsString() username: string;
  @IsString() password: string;
  @IsString() fromDomain: string;
  @IsOptional() @IsString() codecs?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateTrunkDto extends CreateTrunkDto {}
