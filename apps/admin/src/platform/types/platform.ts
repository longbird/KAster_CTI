/**
 * 플랫폼 관리자 API 의 응답 형상. 서버 계약
 * (`docs/plans/2026-09-02-feature-entitlement-plan.md` Phase 2.5) 을 그대로 옮긴 것이므로
 * 여기서 임의로 필드를 늘리거나 이름을 바꾸지 않는다.
 */

/** 로그인·`GET /platform/me` 가 돌려주는 본인 정보. */
export interface PlatformAdminIdentity {
  platformAdminId: string;
  loginId: string;
  displayName: string;
  /** true 면 비밀번호 변경 외의 화면으로 갈 수 없다 (부트스트랩 계정). */
  mustChangePassword: boolean;
}

export interface PlatformLoginResult {
  accessToken: string;
  refreshToken: string;
  admin: PlatformAdminIdentity;
}

export interface PlatformTenantRow {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  isActive: boolean;
}

/** 자격 한 줄. `source: 'default'` 면 아직 테넌트별 행이 없어 기본값으로 판정되는 상태다. */
export interface FeatureEntitlement {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  defaultEnabled: boolean;
  /** 한 번 켜면 끌 수 없다 (설계 D8. 현재는 녹취 암호화만). */
  irreversible: boolean;
  source: 'row' | 'default';
  enabledAt: string | null;
}

export interface TenantEntitlements {
  tenantId: string;
  features: FeatureEntitlement[];
}

export interface UpdateEntitlementInput {
  enabled: boolean;
  note?: string;
  /** 되돌릴 수 없는 기능을 켤 때만 보낸다. 없으면 서버가 400 으로 거부한다. */
  acknowledgeIrreversible?: boolean;
}

export interface UpdateEntitlementResult {
  key: string;
  enabled: boolean;
  enabledAt: string | null;
}

export interface EntitlementHistoryEntry {
  auditLogId: string;
  featureKey: string;
  /** 행이 없던 상태에서의 첫 변경이면 null 이다. */
  beforeEnabled: boolean | null;
  afterEnabled: boolean;
  note: string | null;
  platformAdminId: string | null;
  createdAt: string;
}

export interface PlatformAdminRow {
  platformAdminId: string;
  loginId: string;
  displayName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CreatePlatformAdminInput {
  loginId: string;
  displayName: string;
  password: string;
}
