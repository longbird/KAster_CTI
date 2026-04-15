import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateTrunkDto {
  @IsString() name: string;
  @IsString() host: string;
  @IsInt() @Min(1) @IsOptional() port?: number;
  @IsString() username: string;
  @IsString() password: string;
  @IsString() fromDomain: string;
  @IsString() @IsOptional() codecs?: string;
  @IsBoolean() @IsOptional() enabled?: boolean;
}

export class UpdateTrunkDto extends CreateTrunkDto {}
