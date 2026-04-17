import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreatePromptDto {
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_/-]+$/, {
    message: 'promptKey must contain only letters, numbers, underscore, slash, or hyphen',
  })
  promptKey: string;

  @IsString()
  @MaxLength(128)
  displayName: string;

  @IsString()
  @MaxLength(255)
  fileName: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePromptDto extends CreatePromptDto {}
