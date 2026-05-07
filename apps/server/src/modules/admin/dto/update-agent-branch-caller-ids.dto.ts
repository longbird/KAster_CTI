import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AgentBranchCallerIdEntryDto {
  @ApiProperty()
  @IsUUID()
  agentId!: string;

  @ApiProperty({ example: '02-1234-5678' })
  @IsString()
  @MaxLength(32)
  @Matches(/^[0-9+\-]{1,32}$/, {
    message: 'callerIdNumber는 숫자/+/- 만 허용 (최대 32자)',
  })
  callerIdNumber!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  displayName?: string | null;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  allowedInbound?: boolean;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  allowedOutbound?: boolean;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  allowedTransfer?: boolean;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateAgentBranchCallerIdsDto {
  @ApiProperty({ type: [AgentBranchCallerIdEntryDto] })
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => AgentBranchCallerIdEntryDto)
  entries!: AgentBranchCallerIdEntryDto[];
}
