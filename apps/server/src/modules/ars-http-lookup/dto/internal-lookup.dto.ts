import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** AGI 가 보내는 조회 요청. 값은 전부 채널에서 읽은 것이라 길이만 묶는다. */
export class InternalArsLookupDto {
  @IsUUID()
  tenantId: string;

  @IsUUID()
  endpointId: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  caller?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  collected?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  entryDid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  linkedid?: string;
}
