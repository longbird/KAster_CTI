import { IsObject, IsOptional } from 'class-validator';

export class TestIntegrationAutomationDto {
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
