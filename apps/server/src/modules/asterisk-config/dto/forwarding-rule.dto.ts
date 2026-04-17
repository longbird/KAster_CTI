import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

const FORWARD_TYPES = ['EXTENSION', 'QUEUE'] as const;

export class CreateForwardingRuleDto {
  @IsUUID()
  didId: string;

  @IsIn(FORWARD_TYPES)
  forwardType: string;

  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'targetValue must contain only letters, numbers, underscore, or hyphen' })
  targetValue: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateForwardingRuleDto extends CreateForwardingRuleDto {}
