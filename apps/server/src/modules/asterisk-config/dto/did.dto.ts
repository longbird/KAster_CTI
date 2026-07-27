import { IsBoolean, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateDidDto {
  @IsString() @Matches(/^[0-9+_X.!\[\]-]+$/, { message: 'DID는 유효한 대표번호 또는 PBX 내선 패턴이어야 합니다.' }) did: string;
  @IsOptional() @IsString({ message: '대표번호는 문자열이어야 합니다.' }) representativeNumber?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() ivrMenuId?: string;
  @IsOptional() @IsString({ message: '직접 연결할 호 분배룰은 문자열이어야 합니다.' }) directQueue?: string;
  @IsOptional() @IsString({ message: '직접 연결할 내선은 문자열이어야 합니다.' }) @Matches(/^[0-9]{2,16}$/, { message: 'directExtension must be 2-16 digits' }) directExtension?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateDidDto extends CreateDidDto {}
