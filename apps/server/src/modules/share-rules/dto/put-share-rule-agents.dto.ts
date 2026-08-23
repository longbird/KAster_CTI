import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsUuidFormat } from '../../../common/decorators/is-uuid-format.decorator';

export class ShareRuleAgentEntryDto {
  @IsUuidFormat()
  agentId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}

export class ShareRuleAgentGroupEntryDto {
  @IsUuidFormat()
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
