import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreatePromptTtsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text: string;

  @IsString()
  @MaxLength(128)
  displayName: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_/-]+$/, {
    message: 'promptKey must contain only letters, numbers, underscore, slash, or hyphen',
  })
  promptKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  voice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
