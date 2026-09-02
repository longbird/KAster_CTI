import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';
import { IsUuidFormat } from '../../../common/decorators/is-uuid-format.decorator';

export class CreateDidDto {
  @IsString() @Matches(/^[0-9+_X.!\[\]-]+$/, { message: 'DID는 유효한 대표번호 또는 PBX 내선 패턴이어야 합니다.' }) did: string;
  @IsOptional() @IsString({ message: '대표번호는 문자열이어야 합니다.' }) representativeNumber?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUuidFormat() ivrMenuId?: string;
  @IsOptional() @IsString({ message: '직접 연결할 호 분배룰은 문자열이어야 합니다.' }) directQueue?: string;
  @IsOptional() @IsString({ message: '직접 연결할 내선은 문자열이어야 합니다.' }) @Matches(/^[0-9]{2,16}$/, { message: 'directExtension must be 2-16 digits' }) directExtension?: string;
  // 플로우는 기존 경로를 대체하지 않고 위에 얹힌다. 그래서 라우팅 XOR 에 넣지 않는다 —
  // 넣으면 플로우를 지웠을 때 이 DID 가 갈 곳을 잃는다.
  @IsOptional() @IsUuidFormat() flowId?: string | null;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateDidDto extends CreateDidDto {}
