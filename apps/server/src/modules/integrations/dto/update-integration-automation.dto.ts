import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import {
  INTEGRATION_AUTOMATION_TYPES,
  IntegrationAutomationType,
} from './create-integration-automation.dto';

export class UpdateIntegrationAutomationDto {
  @IsOptional()
  @IsString()
  @IsIn(INTEGRATION_AUTOMATION_TYPES as unknown as string[])
  type?: IntegrationAutomationType;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  name?: string;

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
