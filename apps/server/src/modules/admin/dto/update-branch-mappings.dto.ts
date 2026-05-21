import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

class BranchRoutingRuleDto {
  @IsString()
  queueId!: string;

  @IsIn(['ALWAYS', 'TIME_RANGE'])
  conditionType!: 'ALWAYS' | 'TIME_RANGE';

  @IsOptional()
  @IsString()
  timeStart?: string | null;

  @IsOptional()
  @IsString()
  timeEnd?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  daysOfWeek?: string[];
}

class BranchRoutingProfileDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  representativeDidId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BranchRoutingRuleDto)
  rules?: BranchRoutingRuleDto[];
}

class BranchSectionSelectionDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];
}

class BranchSettingsProfileDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => BranchRoutingProfileDto)
  routing?: BranchRoutingProfileDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BranchSectionSelectionDto)
  forwarding?: BranchSectionSelectionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BranchSectionSelectionDto)
  ars?: BranchSectionSelectionDto;

  @IsOptional()
  @IsObject()
  prompts?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  smartArs?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  recording?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  blocklist080?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  cid?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  smdr?: Record<string, unknown>;
}

export class UpdateBranchMappingsDto {
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  agentIds?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  queueIds?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  didIds?: string[];

  @ApiProperty({ required: false, type: () => BranchSettingsProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BranchSettingsProfileDto)
  settingsProfile?: BranchSettingsProfileDto;
}
