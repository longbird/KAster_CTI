import type { HealthResponse, OperatingMode, OperatingRestrictions } from '../monitoring/types/health';

export interface OperatingModeView {
  mode: OperatingMode;
  restrictions: OperatingRestrictions;
  /** 일반 설정 저장 버튼을 잠글지 */
  disableGeneralWrites: boolean;
  /** 전역 배너를 띄울지 */
  showBanner: boolean;
  bannerSeverity: 'warning' | 'error';
  bannerTitle: string;
  bannerDescription: string;
}

const ALL_ALLOWED: OperatingRestrictions = {
  allowExistingCallControl: true,
  allowGeneralConfigWrites: true,
  allowEmergencyConfigWrites: true,
  allowNewLogin: true,
  allowCustomerCacheMissLookup: true,
};

const MODE_LABEL: Record<OperatingMode, string> = {
  NORMAL: '정상',
  DB_FAILOVER: 'DB 장애조치 중',
  DEGRADED: '제한 운전',
  RECOVERING: '복구 재처리 중',
};

const MODE_DESCRIPTION: Record<OperatingMode, string> = {
  NORMAL: '',
  DB_FAILOVER:
    'DB 장애조치가 진행 중입니다. 진행 중인 통화는 그대로 처리되며, 설정 저장만 일시 차단됩니다.',
  DEGRADED:
    'DB 를 사용할 수 없어 제한 운전 중입니다. 진행 중인 통화 처리는 유지되지만 설정 저장과 신규 로그인이 차단됩니다.',
  RECOVERING:
    'DB 는 복구됐고 누락 이벤트를 재처리하는 중입니다. 재처리가 끝날 때까지 설정 저장이 차단됩니다.',
};

/**
 * /health 응답을 화면이 쓰는 형태로 정규화한다.
 *
 * 응답이 없거나(첫 로딩·네트워크 실패) 구버전 서버라 필드가 없으면 NORMAL 로 본다.
 * 알 수 없다는 이유로 배너를 띄우면 평시에 상시 경고가 떠 아무도 안 보게 된다.
 */
export function toOperatingModeView(health: HealthResponse | null | undefined): OperatingModeView {
  const mode: OperatingMode = health?.operatingMode ?? 'NORMAL';
  const restrictions = health?.restrictions ?? ALL_ALLOWED;

  return {
    mode,
    restrictions,
    disableGeneralWrites: restrictions.allowGeneralConfigWrites === false,
    showBanner: mode !== 'NORMAL',
    bannerSeverity: mode === 'DB_FAILOVER' ? 'warning' : 'error',
    bannerTitle: `DB 장애 대응 모드: ${MODE_LABEL[mode]}`,
    bannerDescription: MODE_DESCRIPTION[mode],
  };
}

export function formatAgeSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${Math.floor(seconds)}초`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간`;
  return `${Math.floor(seconds / 86400)}일`;
}

/** null 은 "0" 이 아니라 "미지원" 으로 보여야 한다. */
export function formatNullableCount(value: number | null | undefined): string {
  return value === null || value === undefined ? '미지원' : String(value);
}
