/**
 * 플랫폼 관리자 토큰은 상담원 토큰과 **같은 `JWT_SECRET`** 으로 서명된다.
 * 그래서 서명만으로는 둘을 구분할 수 없고, payload 의 이 값이 유일한 경계다.
 *
 * 양쪽 가드가 이 상수를 함께 본다 — `JwtAuthGuard` 는 이 scope 를 거부하고,
 * `PlatformAdminGuard` 는 이 scope 만 통과시킨다.
 */
export const PLATFORM_TOKEN_SCOPE = 'platform';

export const PLATFORM_ACCESS_TOKEN_TTL = '15m';
export const PLATFORM_ACCESS_TOKEN_TTL_SECONDS = 900;
export const PLATFORM_REFRESH_TOKEN_TTL_DAYS = 14;

/** 부트스트랩 계정 생성용 env. 비어 있으면 아무것도 하지 않는다. */
export const BOOTSTRAP_LOGIN_ENV = 'PLATFORM_ADMIN_BOOTSTRAP_LOGIN';
export const BOOTSTRAP_PASSWORD_ENV = 'PLATFORM_ADMIN_BOOTSTRAP_PASSWORD';
