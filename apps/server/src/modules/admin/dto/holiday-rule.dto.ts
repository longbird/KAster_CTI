import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { IsUuidFormat } from '../../../common/decorators/is-uuid-format.decorator';

const HOLIDAY_RULE_TYPES = ['DATE', 'ANNUAL', 'WORKDAY_OVERRIDE'] as const;

export class CreateHolidayRuleDto {
  @IsOptional()
  @IsUuidFormat()
  branchId?: string | null;

  @IsString()
  @MaxLength(128)
  ruleName!: string;

  @IsIn(HOLIDAY_RULE_TYPES)
  ruleType!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  holidayDate?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}-\d{2}$/)
  monthDay?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateHolidayRuleDto extends CreateHolidayRuleDto {}
