import {
  classifyTimeSyncStatus,
  computeTimeSyncStatus,
  extractPbxTimeFromAmiFrames,
  unknownTimeSyncStatus,
} from './time-sync-status';

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
        referenceNow: new Date('2026-05-20T00:00:15.400Z'),
        dbNow: new Date('2026-05-20T00:00:15.400Z'),
        source: 'database',
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

  it('computes signed PBX minus app drift seconds', () => {
    expect(
      computeTimeSyncStatus({
        appNow: new Date('2026-05-20T00:00:10.000Z'),
        referenceNow: new Date('2026-05-20T00:01:20.000Z'),
        dbNow: new Date('2026-05-20T00:00:11.000Z'),
        source: 'pbx',
      }),
    ).toMatchObject({
      status: 'CRITICAL',
      driftSeconds: 70,
      appTime: '2026-05-20T00:00:10.000Z',
      dbTime: '2026-05-20T00:00:11.000Z',
      pbxTime: '2026-05-20T00:01:20.000Z',
      source: 'pbx',
    });
  });

  it('returns UNKNOWN when PBX time cannot be read', () => {
    expect(
      unknownTimeSyncStatus({
        appNow: new Date('2026-05-20T00:00:10.000Z'),
        dbNow: new Date('2026-05-20T00:00:11.000Z'),
        source: 'pbx',
        error: 'AMI is not connected',
      }),
    ).toMatchObject({
      status: 'UNKNOWN',
      driftSeconds: 0,
      source: 'pbx',
      pbxTime: null,
      error: 'AMI is not connected',
    });
  });

  it('extracts PBX time from AMI command output', () => {
    expect(
      extractPbxTimeFromAmiFrames([
        {
          Response: 'Follows',
          Output: 'Result: 2026-05-20T09:00:15+0900',
        },
      ])?.toISOString(),
    ).toBe('2026-05-20T00:00:15.000Z');
  });
});
