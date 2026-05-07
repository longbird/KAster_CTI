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
import { OUTBOUND_MATCH_TYPES, OutboundMatchTypeDto } from './create-outbound-rule.dto';

export class UpdateOutboundRuleDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @ApiProperty({ required: false, enum: OUTBOUND_MATCH_TYPES })
  @IsOptional()
  @IsEnum(OUTBOUND_MATCH_TYPES)
  matchType?: OutboundMatchTypeDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceNumberPattern?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  callerIdNumber?: string;

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
