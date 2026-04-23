import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ExecuteOptOutActionDto {
  @IsString()
  @MaxLength(64)
  tenantId: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  entryDid?: string;

  @IsString()
  @MaxLength(32)
  requesterPhoneNumber: string;

  @IsString()
  @MaxLength(32)
  sourceType: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  smsTemplateId?: string;
}
