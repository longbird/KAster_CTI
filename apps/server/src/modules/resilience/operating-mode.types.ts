/**
 * 서버의 1급 런타임 운영 모드.
 *
 * NORMAL       평시
 * DB_FAILOVER  DB 접근 실패 직후. 자동 장애조치가 곧 끝날 것으로 보는 짧은 구간
 * DEGRADED     장애가 임계 시간을 넘김. 제한 운전
 * RECOVERING   DB 는 돌아왔지만 재처리가 끝나지 않음
 */
export type OperatingMode = 'NORMAL' | 'DB_FAILOVER' | 'DEGRADED' | 'RECOVERING';

/**
 * 모드별로 무엇을 허용할지. 원칙은 하나다 —
 * **이미 진행 중인 통화는 끝까지 처리하고, 새로 상태를 만드는 쓰기를 막는다.**
 */
export interface OperatingRestrictions {
  /** 진행 중인 통화의 보류/전환/종료. 어떤 모드에서도 막지 않는다 */
  allowExistingCallControl: boolean;
  /** 일반 설정 저장. 장애 중에는 큐잉하지 않고 차단한다 */
  allowGeneralConfigWrites: boolean;
  /** 승인·사유를 동반한 긴급 라우팅 변경 */
  allowEmergencyConfigWrites: boolean;
  /** 신규 로그인. 세션 발급은 DB 쓰기를 동반한다 */
  allowNewLogin: boolean;
  /** 캐시에 없는 고객을 DB 에서 조회 */
  allowCustomerCacheMissLookup: boolean;
}

export type ConfigSource = 'fresh' | 'lkg' | 'missing';

export interface DataFreshness {
  db: 'fresh' | 'stale' | 'unavailable';
  config: ConfigSource;
  customer: 'fresh' | 'cache-only' | 'unavailable';
}

export interface OperatingModeSnapshot {
  mode: OperatingMode;
  /** 현재 모드에 진입한 시각 (ISO) */
  since: string;
  lastDbFailureAt: string | null;
  lastDbRecoveredAt: string | null;
  dataFreshness: DataFreshness;
  restrictions: OperatingRestrictions;
}

const ALL_ALLOWED: OperatingRestrictions = {
  allowExistingCallControl: true,
  allowGeneralConfigWrites: true,
  allowEmergencyConfigWrites: true,
  allowNewLogin: true,
  allowCustomerCacheMissLookup: true,
};

export const RESTRICTIONS_BY_MODE: Record<OperatingMode, OperatingRestrictions> = {
  NORMAL: ALL_ALLOWED,

  // 짧은 장애조치 구간. 기존 통화는 그대로 두되 새 설정 쓰기는 막는다.
  // 로그인은 아직 허용한다 — 장애조치가 수 초 안에 끝나면 상담원이 체감하지 않는다.
  DB_FAILOVER: {
    ...ALL_ALLOWED,
    allowGeneralConfigWrites: false,
    allowCustomerCacheMissLookup: false,
  },

  // 제한 운전. 신규 로그인까지 막는다 (세션 발급이 DB 쓰기를 동반한다).
  DEGRADED: {
    allowExistingCallControl: true,
    allowGeneralConfigWrites: false,
    allowEmergencyConfigWrites: true,
    allowNewLogin: false,
    allowCustomerCacheMissLookup: false,
  },

  // DB 는 살아났지만 재처리가 끝나기 전. 일반 설정 쓰기를 열면 replay 와 충돌한다.
  RECOVERING: {
    ...ALL_ALLOWED,
    allowGeneralConfigWrites: false,
  },
};
