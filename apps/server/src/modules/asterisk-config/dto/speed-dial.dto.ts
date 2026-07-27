import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateSpeedDialDto {
  @IsString()
  @Matches(/^[0-9*#]{1,16}$/, { message: 'code must contain 1-16 digits or *#' })
  code: string;

  @IsString()
  @Matches(/^[0-9]{2,32}$/, { message: 'targetNumber must contain 2-32 digits' })
  targetNumber: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateSpeedDialDto extends CreateSpeedDialDto {}
