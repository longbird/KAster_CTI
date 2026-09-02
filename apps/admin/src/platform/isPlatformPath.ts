/** 플랫폼 화면이 사는 경로 접두사. */
export const PLATFORM_PATH_PREFIX = '/platform';

/**
 * 이 경로가 플랫폼 관리자 영역인가.
 *
 * 플랫폼 화면은 테넌트 관리자 로그인(`RequireAuth`) 밖에 있어야 한다 — 관리자 토큰이 없어도
 * `/platform/login` 에 들어올 수 있어야 하기 때문이다. 그래서 앱 최상위에서 이 함수로 갈라 놓는다.
 * `/platformx` 처럼 접두사만 같은 경로가 새어 들어오지 않게 경계 문자까지 본다.
 */
export function isPlatformPath(pathname: string): boolean {
  if (pathname === PLATFORM_PATH_PREFIX) return true;
  return pathname.startsWith(`${PLATFORM_PATH_PREFIX}/`);
}
