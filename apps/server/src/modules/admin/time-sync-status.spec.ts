import { classifyTimeSyncStatus, computeTimeSyncStatus } from './time-sync-status';

describe('time sync status', () => {
  it('classifies small drift as OK', () => {
    expect(classifyTimeSyncStatus(4)).toBe('OK');
  });

  it('classifies medium drift as WARNING', () => {
    expect(classifyTimeSyncStatus(30)).toBe('WARNING');
  });

  it('classifies large drift as CRITICAL', () => {
    expect(classifyTimeSyncStatus(-90)).toBe('CRITICAL');
  });

  it('computes signed DB minus app drift seconds', () => {
    expect(
      computeTimeSyncStatus({
        appNow: new Date('2026-05-20T00:00:10.000Z'),
        dbNow: new Date('2026-05-20T00:00:15.400Z'),
      }),
    ).toEqual({
      status: 'WARNING',
      driftSeconds: 5,
      appTime: '2026-05-20T00:00:10.000Z',
      dbTime: '2026-05-20T00:00:15.400Z',
      source: 'database',
      warningThresholdSeconds: 5,
      criticalThresholdSeconds: 60,
    });
  });
});
