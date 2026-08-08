import { SetMetadata } from '@nestjs/common';

export const WRITE_AVAILABILITY_KEY = 'writeAvailability';

/** 일반 설정 쓰기인지 승인 동반 긴급 쓰기인지. 둘의 허용 정책이 다르다. */
export type WriteKind = 'general' | 'emergency';

/**
 * 운영 모드에 따라 차단할 쓰기 엔드포인트에 붙인다. WriteAvailabilityGuard 가 읽는다.
 * 예: @RequiresWriteAvailability('general')
 *
 * 조회 엔드포인트에는 붙이지 않는다 — 장애 중에도 읽기는 열어둔다.
 */
export const RequiresWriteAvailability = (kind: WriteKind) =>
  SetMetadata(WRITE_AVAILABILITY_KEY, kind);
