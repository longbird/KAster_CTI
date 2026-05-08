import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class ShareRuleAgentEntryDto {
  @IsUUID()
  agentId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}

export class ShareRuleAgentGroupEntryDto {
  @IsUUID()
  agentGroupId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}

export class PutShareRuleAgentsDto {
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ShareRuleAgentEntryDto)
  agents!: ShareRuleAgentEntryDto[];

  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ShareRuleAgentGroupEntryDto)
  agentGroups!: ShareRuleAgentGroupEntryDto[];
}
