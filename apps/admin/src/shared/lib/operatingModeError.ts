import type { AxiosError } from 'axios';

export const OPERATING_MODE_RESTRICTED = 'OPERATING_MODE_RESTRICTED';

interface RestrictedBody {
  code?: string;
  message?: string;
  operatingMode?: string;
}

/**
 * 서버가 DB 장애 대응 모드 때문에 쓰기를 거부했는지 판별한다.
 *
 * 503 만 보고 판단하지 않는다. 로드밸런서나 리버스 프록시도 503 을 내는데, 그때
 * "설정 변경이 차단되었습니다" 라고 안내하면 운영자가 원인을 잘못 짚는다.
 * 우리 서버가 명시적으로 붙인 code 가 있을 때만 이 경로로 처리한다.
 */
export function extractOperatingModeRestriction(error: unknown): RestrictedBody | null {
  const response = (error as AxiosError)?.response;
  if (!response || response.status !== 503) return null;

  // ResponseTransformInterceptor 가 { success, data, error } 로 감싸는 경우와
  // 예외 필터가 본문을 그대로 내보내는 경우를 모두 본다.
  const body = response.data as Record<string, any> | undefined;
  const candidates = [body, body?.error, body?.data].filter(Boolean) as RestrictedBody[];

  for (const candidate of candidates) {
    if (candidate?.code === OPERATING_MODE_RESTRICTED) return candidate;
  }
  return null;
}

export function operatingModeRestrictionMessage(body: RestrictedBody): string {
  const base = body.message?.trim() || 'DB 장애 대응 모드에서는 설정을 저장할 수 없습니다.';
  return body.operatingMode ? `${base} (현재 모드: ${body.operatingMode})` : base;
}
