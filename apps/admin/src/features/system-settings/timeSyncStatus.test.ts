import { describe, expect, it } from 'vitest';
import { getTimeSyncStatusMeta } from './timeSyncStatus';

describe('getTimeSyncStatusMeta', () => {
  it('maps known statuses to operator labels', () => {
    expect(getTimeSyncStatusMeta('OK').label).toBe('정상');
    expect(getTimeSyncStatusMeta('WARNING').label).toBe('주의');
    expect(getTimeSyncStatusMeta('CRITICAL').label).toBe('위험');
    expect(getTimeSyncStatusMeta('UNKNOWN').label).toBe('확인 불가');
  });
});
