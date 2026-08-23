import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { IsUuidFormat } from '../../../common/decorators/is-uuid-format.decorator';

export class ShareRuleBranchEntryDto {
  @IsUuidFormat()
  branchId!: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  @Matches(/^[0-9+\-\s]*$/)
  mainPhone?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  @Matches(/^[0-9+\-\s]*$/)
  transferPhone?: string;
}

export class PutShareRuleBranchesDto {
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ShareRuleBranchEntryDto)
  branches!: ShareRuleBranchEntryDto[];
}
