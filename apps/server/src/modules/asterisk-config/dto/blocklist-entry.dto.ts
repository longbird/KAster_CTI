import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateBlocklistEntryDto {
  @IsString()
  @MaxLength(32)
  @Matches(/^\d{8,16}$/, { message: 'phoneNumber must contain 8 to 16 digits' })
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
