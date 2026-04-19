import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const MATCH_TYPES = ['EXACT', 'PREFIX'] as const;

export class CreateBlocklistEntryDto {
  @IsOptional()
  @IsIn(MATCH_TYPES)
  matchType?: string;

  @IsString()
  @MaxLength(32)
  @Matches(/^\d{2,16}$/, { message: 'phoneNumber must contain 2 to 16 digits' })
  phoneNumber: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBlocklistEntryDto extends CreateBlocklistEntryDto {}
