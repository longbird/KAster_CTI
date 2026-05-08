import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateShareRuleDto {
  @IsString()
  @Length(1, 32)
  @Matches(/^[A-Za-z0-9_\-]+$/)
  ruleCode!: string;

  @IsString()
  @Length(1, 128)
  ruleName!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
