/** 첫 테넌트·첫 관리자 부트스트랩 env. 넷 중 하나라도 비면 아무것도 하지 않는다. */
export const TENANT_BOOTSTRAP_CODE_ENV = 'TENANT_BOOTSTRAP_CODE';
export const TENANT_BOOTSTRAP_NAME_ENV = 'TENANT_BOOTSTRAP_NAME';
export const TENANT_BOOTSTRAP_ADMIN_LOGIN_ENV = 'TENANT_BOOTSTRAP_ADMIN_LOGIN';
export const TENANT_BOOTSTRAP_ADMIN_PASSWORD_ENV = 'TENANT_BOOTSTRAP_ADMIN_PASSWORD';
export const TENANT_BOOTSTRAP_ADMIN_EXTENSION_ENV = 'TENANT_BOOTSTRAP_ADMIN_EXTENSION';

/**
 * 첫 테넌트는 이 고정 id 로 만든다.
 *
 * `AmiEventNormalizerService` · `SipSecurityService` · `AgentOfferController` 가 `TenantId` 없는
 * AMI 이벤트를 이 id 로 폴백한다 (시드 `prisma/seed.ts` 와 같은 값). 임의 UUID 로 만들면
 * 신규 사이트에서 PBX 이벤트가 존재하지 않는 테넌트로 흘러 세션이 하나도 생기지 않는다.
 */
export const BOOTSTRAP_TENANT_ID = '00000000-0000-0000-0000-000000000001';

/** 관리자 내선 기본값. 시드의 supervisor(2001) 와 겹치지 않게 둔다. */
export const DEFAULT_ADMIN_EXTENSION = '2000';
