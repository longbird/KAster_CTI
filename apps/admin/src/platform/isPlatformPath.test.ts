import { describe, expect, it } from 'vitest';
import { isPlatformPath } from './isPlatformPath';

describe('isPlatformPath', () => {
  it('플랫폼 최상위 경로를 플랫폼으로 본다', () => {
    expect(isPlatformPath('/platform')).toBe(true);
  });

  it('플랫폼 하위 경로를 플랫폼으로 본다', () => {
    expect(isPlatformPath('/platform/login')).toBe(true);
    expect(isPlatformPath('/platform/tenants/abc')).toBe(true);
    expect(isPlatformPath('/platform/admins')).toBe(true);
  });

  it('접두사만 같은 경로는 플랫폼이 아니다', () => {
    expect(isPlatformPath('/platformx')).toBe(false);
    expect(isPlatformPath('/platform-admin')).toBe(false);
  });

  it('관리자 경로는 플랫폼이 아니다', () => {
    expect(isPlatformPath('/')).toBe(false);
    expect(isPlatformPath('/dashboard')).toBe(false);
    expect(isPlatformPath('/settings/agents')).toBe(false);
  });

  it('경로 중간에 platform 이 들어간 관리자 경로도 플랫폼이 아니다', () => {
    expect(isPlatformPath('/settings/platform')).toBe(false);
  });
});
