import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * UUID **모양**만 본다. `@IsUUID()` 를 쓰지 않는 이유가 있다 —
 * class-validator 0.14 의 `isUUID` 는 버전 니블(3번째 묶음의 첫 글자 1~8, 4번째 8/9/a/b)을 요구하는데,
 * 이 시스템이 실제로 쓰는 테넌트 id 는 시드가 만든 `00000000-0000-0000-0000-000000000001` 이라
 * 그 검사를 통과하지 못한다. AGI 는 채널에서 읽은 그 값을 그대로 보낸다.
 * (2026-09-02 로컬 실 왕복에서 400 으로 드러났다.)
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** AGI 가 보내는 조회 요청. 값은 전부 채널에서 읽은 것이라 길이만 묶는다. */
export class InternalArsLookupDto {
  @Matches(UUID_SHAPE, { message: 'tenantId must look like a UUID' })
  tenantId: string;

  @Matches(UUID_SHAPE, { message: 'endpointId must look like a UUID' })
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
