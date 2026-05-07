import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export const INTEGRATION_AUTOMATION_TYPES = [
  'VIX_PHONE',
  'VIX_SMS',
  'WEBHOOK',
  'SLACK_WEBHOOK',
] as const;

export type IntegrationAutomationType = (typeof INTEGRATION_AUTOMATION_TYPES)[number];

export class CreateIntegrationAutomationDto {
  @IsString()
  @IsIn(INTEGRATION_AUTOMATION_TYPES as unknown as string[])
  type!: IntegrationAutomationType;

  @IsString()
  @Length(1, 128)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
