import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { FEATURE_CODE_KEYS } from '../../../common/feature-code-catalog';

export class UpsertFeatureCodeDto {
  // 카탈로그에 있는 키만 받는다. 기능코드는 자유 생성이 아니다.
  @IsString()
  @IsIn(FEATURE_CODE_KEYS, { message: 'featureKey must be one of the supported features' })
  featureKey: string;

  // 빈 문자열은 "미설정"으로 정규화된다. 형식/충돌 검증은 서비스에서 한다.
  @IsOptional()
  @IsString()
  @MaxLength(16)
  code?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
