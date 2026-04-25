import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ExecuteSmartArsActionDto {
  @IsString()
  @MaxLength(64)
  tenantId: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  branchId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  entryDid?: string | null;

  @IsString()
  @MaxLength(32)
  requesterPhoneNumber: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  smsTemplateId?: string | null;
}
