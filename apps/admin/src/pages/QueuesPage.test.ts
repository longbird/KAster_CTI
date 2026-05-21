import { describe, expect, it } from 'vitest';
import { buildQueueDrillDownStats } from './QueuesPage';

describe('buildQueueDrillDownStats', () => {
  it('builds stable queue drill-down counters', () => {
    expect(
      buildQueueDrillDownStats({
        queueId: 'queue-1',
        queueName: 'sales',
        waiting: 3,
        ringing: 1,
        talking: 2,
        available: 4,
        paused: 1,
        longestWaitSeconds: 42,
        recentAnswered: 12,
        recentAbandoned: 2,
      }),
    ).toEqual([
      { label: '대기', value: 3 },
      { label: '링잉', value: 1 },
      { label: '통화 중', value: 2 },
      { label: '가용', value: 4 },
      { label: '일시정지', value: 1 },
      { label: '최장 대기', value: '42s' },
      { label: '최근 응답', value: 12 },
      { label: '최근 포기', value: 2 },
    ]);
  });
});
