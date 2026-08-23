import {
  IsArray,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsUuidFormat } from '../../../common/decorators/is-uuid-format.decorator';
import { Type } from 'class-transformer';

export class QueueMemberItemDto {
  @IsUuidFormat()
  agentId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  penalty?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  memberOrder?: number;
}

export class SetQueueMembersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QueueMemberItemDto)
  members: QueueMemberItemDto[];
}
