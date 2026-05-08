import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export const OUTBOUND_MATCH_TYPES = [
  'EXACT',
  'PREFIX',
  'REGEX',
  'DIALPLAN_PATTERN',
] as const;
export type OutboundMatchTypeDto = (typeof OUTBOUND_MATCH_TYPES)[number];

export class CreateOutboundRuleDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @ApiProperty({ enum: OUTBOUND_MATCH_TYPES })
  @IsEnum(OUTBOUND_MATCH_TYPES)
  matchType!: OutboundMatchTypeDto;

  @ApiProperty({ example: '010' })
  @IsString()
  @MaxLength(64)
  sourceNumberPattern!: string;

  @ApiProperty({ example: '02-1234-5678' })
  @IsString()
  @MaxLength(32)
  callerIdNumber!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  displayName?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  memo?: string | null;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
