import { describe, expect, it } from 'vitest';
import {
  formatAgeSeconds,
  formatNullableCount,
  toOperatingModeView,
} from './operatingMode';
import type { HealthResponse } from '../monitoring/types/health';

function health(overrides: Partial<HealthResponse>): HealthResponse {
  return {
    status: 'ok',
    timestamp: '2026-08-08T00:00:00.000Z',
    instanceId: 'node-1',
    leader: true,
    checks: { db: 'up', redis: 'up', ami: 'connected' },
    call: {
      active: 0, queued: 0, ringing: 0, talking: 0,
      hold: 0, transferring: 0, stuck: 0, longestWaitingSeconds: 0,
    },
    agent: { available: 0, talking: 0, ringing: 0, paused: 0, loggedIn: 0 },
    queue: { waiting: 0, ringing: 0, talking: 0, availableAgents: 0, longestWaitSeconds: 0 },
    ...overrides,
  };
}

describe('toOperatingModeView', () => {
  it('응답이 없으면 NORMAL 로 보고 배너를 띄우지 않는다', () => {
    // 알 수 없다는 이유로 배너를 띄우면 평시에 상시 경고가 떠 아무도 안 보게 된다.
    const view = toOperatingModeView(null);

    expect(view.mode).toBe('NORMAL');
    expect(view.showBanner).toBe(false);
    expect(view.disableGeneralWrites).toBe(false);
  });

  it('구버전 서버 응답(필드 없음)도 NORMAL 로 처리한다', () => {
    const view = toOperatingModeView(health({}));

    expect(view.mode).toBe('NORMAL');
    expect(view.showBanner).toBe(false);
  });

  it('DB_FAILOVER 는 warning 배너를 띄운다', () => {
    const view = toOperatingModeView(health({ operatingMode: 'DB_FAILOVER' }));

    expect(view.showBanner).toBe(true);
    expect(view.bannerSeverity).toBe('warning');
    expect(view.bannerTitle).toContain('DB 장애조치 중');
  });

  it('DEGRADED 와 RECOVERING 은 error 배너를 띄운다', () => {
    expect(toOperatingModeView(health({ operatingMode: 'DEGRADED' })).bannerSeverity).toBe('error');
    expect(toOperatingModeView(health({ operatingMode: 'RECOVERING' })).bannerSeverity).toBe('error');
  });

  it('서버가 보낸 restrictions 로 저장 버튼 잠금을 결정한다', () => {
    const view = toOperatingModeView(
      health({
        operatingMode: 'DEGRADED',
        restrictions: {
          allowExistingCallControl: true,
          allowGeneralConfigWrites: false,
          allowEmergencyConfigWrites: true,
          allowNewLogin: false,
          allowCustomerCacheMissLookup: false,
        },
      }),
    );

    expect(view.disableGeneralWrites).toBe(true);
    expect(view.restrictions.allowExistingCallControl).toBe(true);
  });

  it('제한 모드라도 서버가 일반 쓰기를 허용하면 잠그지 않는다', () => {
    // 잠금 판단의 진실원은 서버의 restrictions 다. 화면이 모드로 추측하지 않는다.
    const view = toOperatingModeView(
      health({
        operatingMode: 'DB_FAILOVER',
        restrictions: {
          allowExistingCallControl: true,
          allowGeneralConfigWrites: true,
          allowEmergencyConfigWrites: true,
          allowNewLogin: true,
          allowCustomerCacheMissLookup: true,
        },
      }),
    );

    expect(view.disableGeneralWrites).toBe(false);
  });
});

describe('formatAgeSeconds', () => {
  it.each([
    [null, '—'],
    [undefined, '—'],
    [12, '12초'],
    [90, '1분'],
    [7200, '2시간'],
    [172800, '2일'],
  ])('%s → %s', (input, expected) => {
    expect(formatAgeSeconds(input as number | null)).toBe(expected);
  });
});

describe('formatNullableCount', () => {
  it('0 과 미지원(null) 을 구분한다', () => {
    expect(formatNullableCount(0)).toBe('0');
    expect(formatNullableCount(null)).toBe('미지원');
  });
});
