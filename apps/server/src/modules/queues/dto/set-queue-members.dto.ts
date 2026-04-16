import {
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class QueueMemberItemDto {
  @IsUUID()
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
