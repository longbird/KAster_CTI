import { describe, expect, it } from 'vitest';
import { buildKpiCards } from './KpiPage';

describe('buildKpiCards', () => {
  it('separates idle agents from queue available totals', () => {
    const cards = buildKpiCards({
      today: { answered: 0, abandoned: 0 },
      queues: [
        {
          queueName: 'support',
          waiting: 0,
          talking: 0,
          available: 4,
          longestWaitSeconds: 0,
          recentAnswered: 0,
          recentAbandoned: 0,
        },
      ],
      agentStatusDistribution: {
        AVAILABLE: 1,
      },
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: '대기 콜', value: 0 }),
        expect.objectContaining({ title: '대기 상담원', value: 1 }),
      ]),
    );
    expect(cards.map((card) => card.title)).toEqual([
      '오늘 응답',
      '오늘 포기',
      '응답률',
      '대기 콜',
      '현재 통화 중',
      '대기 상담원',
    ]);
  });
});
