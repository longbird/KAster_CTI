import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';

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
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBlocklistEntryDto extends CreateBlocklistEntryDto {}

export class ImportBlocklistEntryRowDto {
  @Transform(({ value }) => String(value ?? ''))
  @IsString()
  전화번호!: string;

  @IsOptional()
  @Transform(({ value }) => String(value ?? ''))
  @IsString()
  사유?: string;
}

export class ImportBlocklistEntriesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportBlocklistEntryRowDto)
  rows!: ImportBlocklistEntryRowDto[];
}
