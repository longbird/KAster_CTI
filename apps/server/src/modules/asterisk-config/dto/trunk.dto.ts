import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTrunkDto {
  @IsString() name: string;
  @IsString() host: string;
  @IsOptional() @IsInt() @Min(1) port?: number;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() fromDomain?: string;
  @IsOptional() @IsString() @Matches(/^$|^\d{2,16}$/, { message: 'displayNumber must be 2-16 digits' }) displayNumber?: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9,]+$/, { message: 'codecs must be comma-separated codec names (e.g. alaw,ulaw)' }) codecs?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateTrunkDto extends CreateTrunkDto {}

export class BulkTrunkEntryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() host?: string;
  @IsOptional() @IsInt() @Min(1) port?: number;
}

export class CreateBulkTrunksDto {
  @IsOptional() @IsString() namePrefix?: string;
  @IsOptional() @IsString() host?: string;
  @IsOptional() @IsInt() @Min(1) port?: number;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() fromDomain?: string;
  @IsOptional() @IsString() @Matches(/^$|^\d{2,16}$/, { message: 'displayNumber must be 2-16 digits' }) displayNumber?: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9,]+$/, { message: 'codecs must be comma-separated codec names (e.g. alaw,ulaw)' }) codecs?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkTrunkEntryDto)
  entries: BulkTrunkEntryDto[];
}

export class TrunkGroupMemberDto {
  @IsString() trunkId: string;
  @IsOptional() @IsInt() @Min(1) priority?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class CreateTrunkGroupDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() strategy?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() enabled?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrunkGroupMemberDto)
  members: TrunkGroupMemberDto[];
}

export class UpdateTrunkGroupDto extends CreateTrunkGroupDto {}
