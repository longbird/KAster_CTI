import { describe, expect, it } from 'vitest';
import {
  describeEntitlementSource,
  entitlementSwitchState,
  formatEntitlementChange,
  formatPlatformDateTime,
  historyFeatureLabel,
  needsIrreversibleAck,
  sortEntitlementRows,
} from './entitlementView';
import type { EntitlementHistoryEntry, FeatureEntitlement } from './platform';

function feature(overrides: Partial<FeatureEntitlement> & Pick<FeatureEntitlement, 'key'>): FeatureEntitlement {
  return {
    name: '이름',
    description: '설명',
    enabled: false,
    defaultEnabled: false,
    irreversible: false,
    source: 'default',
    enabledAt: null,
    ...overrides,
  };
}

describe('sortEntitlementRows', () => {
  it('되돌릴 수 없는 기능을 맨 아래로 내린다', () => {
    const rows = sortEntitlementRows([
      feature({ key: 'a' }),
      feature({ key: 'recording-encryption', irreversible: true }),
      feature({ key: 'b' }),
    ]);

    expect(rows.map((row) => row.key)).toEqual(['a', 'b', 'recording-encryption']);
  });

  it('같은 무리 안에서는 서버가 준 순서를 유지한다', () => {
    const rows = sortEntitlementRows([feature({ key: 'c' }), feature({ key: 'a' }), feature({ key: 'b' })]);

    expect(rows.map((row) => row.key)).toEqual(['c', 'a', 'b']);
  });

  it('원본 배열을 바꾸지 않는다', () => {
    const input = [feature({ key: 'a', irreversible: true }), feature({ key: 'b' })];

    sortEntitlementRows(input);

    expect(input.map((row) => row.key)).toEqual(['a', 'b']);
  });

  it('빈 목록도 다룬다', () => {
    expect(sortEntitlementRows([])).toEqual([]);
  });
});

describe('entitlementSwitchState', () => {
  it('되돌릴 수 없는 기능이 켜져 있으면 잠근다', () => {
    const state = entitlementSwitchState(feature({ key: 'recording-encryption', irreversible: true, enabled: true }));

    expect(state.checked).toBe(true);
    expect(state.locked).toBe(true);
    expect(state.lockReason).toContain('끌 수 없는');
  });

  it('되돌릴 수 없는 기능이라도 꺼져 있으면 켤 수 있다', () => {
    const state = entitlementSwitchState(feature({ key: 'recording-encryption', irreversible: true, enabled: false }));

    expect(state.locked).toBe(false);
    expect(state.lockReason).toBeNull();
  });

  it('되돌릴 수 있는 기능은 켜져 있어도 잠기지 않는다', () => {
    const state = entitlementSwitchState(feature({ key: 'packet-capture', enabled: true }));

    expect(state.checked).toBe(true);
    expect(state.locked).toBe(false);
  });
});

describe('needsIrreversibleAck', () => {
  it('되돌릴 수 없는 기능을 켤 때만 확인이 필요하다', () => {
    const irreversible = feature({ key: 'recording-encryption', irreversible: true });

    expect(needsIrreversibleAck(irreversible, true)).toBe(true);
    expect(needsIrreversibleAck(irreversible, false)).toBe(false);
  });

  it('되돌릴 수 있는 기능은 켜도 확인이 필요 없다', () => {
    const reversible = feature({ key: 'packet-capture' });

    expect(needsIrreversibleAck(reversible, true)).toBe(false);
    expect(needsIrreversibleAck(reversible, false)).toBe(false);
  });
});

describe('describeEntitlementSource', () => {
  it('행이 있으면 개별 설정으로 표시한다', () => {
    expect(describeEntitlementSource(feature({ key: 'a', source: 'row', enabled: true }))).toBe('개별 설정');
  });

  it('행이 없으면 기본값과 그 값을 함께 보여준다', () => {
    expect(describeEntitlementSource(feature({ key: 'a', source: 'default', defaultEnabled: true }))).toBe(
      '기본값 (허용)',
    );
    expect(describeEntitlementSource(feature({ key: 'b', source: 'default', defaultEnabled: false }))).toBe(
      '기본값 (차단)',
    );
  });
});

describe('formatEntitlementChange', () => {
  it('이전 값이 없으면 기본값에서 바뀐 것으로 적는다', () => {
    expect(formatEntitlementChange(null, true)).toBe('기본값 → 허용');
    expect(formatEntitlementChange(undefined, false)).toBe('기본값 → 차단');
  });

  it('이전 값이 있으면 그대로 적는다', () => {
    expect(formatEntitlementChange(false, true)).toBe('차단 → 허용');
    expect(formatEntitlementChange(true, false)).toBe('허용 → 차단');
  });
});

describe('formatPlatformDateTime', () => {
  it('ISO 시각을 분 단위까지 보여준다', () => {
    expect(formatPlatformDateTime('2026-09-02T01:23:45.000Z')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('값이 없으면 자리만 지킨다', () => {
    expect(formatPlatformDateTime(null)).toBe('-');
    expect(formatPlatformDateTime(undefined)).toBe('-');
    expect(formatPlatformDateTime('')).toBe('-');
  });

  it('깨진 값도 화면을 깨지 않는다', () => {
    expect(formatPlatformDateTime('not-a-date')).toBe('-');
  });
});

describe('historyFeatureLabel', () => {
  const entry: EntitlementHistoryEntry = {
    auditLogId: 'log-1',
    featureKey: 'recording-encryption',
    beforeEnabled: null,
    afterEnabled: true,
    note: null,
    platformAdminId: null,
    createdAt: '2026-09-02T00:00:00.000Z',
  };

  it('카탈로그에 있으면 이름으로 보여준다', () => {
    expect(
      historyFeatureLabel(entry, [feature({ key: 'recording-encryption', name: '녹취 암호화', irreversible: true })]),
    ).toBe('녹취 암호화');
  });

  it('카탈로그에서 사라진 키는 키 자체를 남긴다', () => {
    expect(historyFeatureLabel(entry, [])).toBe('recording-encryption');
  });
});
