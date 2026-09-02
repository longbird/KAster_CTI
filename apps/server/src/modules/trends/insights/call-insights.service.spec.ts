import { BadRequestException } from '@nestjs/common';
import { CallInsightsService } from './call-insights.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

const FROM = '2026-09-01T00:00:00Z';
const TO = '2026-09-02T00:00:00Z';

interface RawResults {
  sentiment?: any[];
  categories?: any[];
  currentKeywords?: any[];
  previousKeywords?: any[];
  coverage?: any[];
}

function buildService(results: RawResults = {}) {
  // $queryRaw 호출 순서를 서비스가 정하므로, 어떤 쿼리인지 SQL 본문으로 가려낸다.
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const prisma: any = {
    queues: { findFirst: jest.fn().mockResolvedValue({ queueId: 'q1', queueName: '일반' }) },
    $queryRaw: jest.fn().mockImplementation((template: any, ...values: unknown[]) => {
      const text: string = Array.isArray(template?.strings)
        ? template.strings.join(' ? ')
        : Array.isArray(template)
          ? template.join(' ? ')
          : String(template);
      const allValues = Array.isArray(template?.values) ? template.values : values;
      calls.push({ text, values: allValues });

      if (text.includes('jsonb_array_elements_text')) {
        const isPrevious = calls.filter((c) => c.text.includes('jsonb_array_elements_text')).length > 1;
        return Promise.resolve(
          (isPrevious ? results.previousKeywords : results.currentKeywords) ?? [],
        );
      }
      if (text.includes('consultCategories')) return Promise.resolve(results.categories ?? []);
      if (text.includes('analyzedCalls')) return Promise.resolve(results.coverage ?? [{ totalCalls: 0, analyzedCalls: 0 }]);
      return Promise.resolve(results.sentiment ?? []);
    }),
  };

  return { service: new CallInsightsService(prisma), prisma, calls };
}

describe('CallInsightsService', () => {
  describe('입력 검증', () => {
    it('from 이 to 보다 늦으면 거절한다', async () => {
      const { service } = buildService();

      await expect(service.query(TENANT_ID, { from: TO, to: FROM })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('날짜가 깨졌으면 거절한다', async () => {
      const { service } = buildService();

      await expect(service.query(TENANT_ID, { from: 'nope', to: TO })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('구간이 너무 잘게 쪼개지면 더 굵은 해상도를 쓰라고 거절한다', async () => {
      const { service } = buildService();

      await expect(
        service.query(TENANT_ID, { from: '2026-01-01T00:00:00Z', to: '2026-09-01T00:00:00Z', resolution: 'PT1M' }),
      ).rejects.toThrow(/해상도/);
    });

    it('해상도를 생략하면 기간에 맞춰 고른다', async () => {
      const { service } = buildService();

      const result = await service.query(TENANT_ID, { from: FROM, to: TO });

      expect(result.range.resolution).toBe('PT1M');
    });

    it('테넌트 밖의 큐를 물으면 빈 결과가 아니라 오류를 준다', async () => {
      const { service, prisma } = buildService();
      prisma.queues.findFirst.mockResolvedValue(null);

      await expect(service.query(TENANT_ID, { from: FROM, to: TO, queueId: 'q9' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('집계', () => {
    it('감정 추이를 요청 구간 전체 버킷으로 채운다', async () => {
      const { service } = buildService({
        sentiment: [
          { bucketStart: new Date('2026-09-01T03:00:00Z'), positive: 1n, neutral: 2n, negative: 3n },
        ],
      });

      const result = await service.query(TENANT_ID, { from: FROM, to: TO, resolution: 'PT1H' });

      expect(result.sentimentSeries).toHaveLength(24);
      expect(result.sentimentSeries[3]).toMatchObject({ positive: 1, neutral: 2, negative: 3, total: 6 });
      expect(result.sentimentSeries[0].total).toBe(0);
    });

    it('상담분류 분포를 건수 순으로 준다', async () => {
      const { service } = buildService({
        categories: [
          { categoryId: 'c1', code: 'DELIVERY', name: '배송', calls: 10n, avgTalkSeconds: 61.4, negativeCalls: 4n },
          { categoryId: null, code: null, name: null, calls: 3n, avgTalkSeconds: null, negativeCalls: 0n },
        ],
      });

      const result = await service.query(TENANT_ID, { from: FROM, to: TO, resolution: 'PT1H' });

      expect(result.categories[0]).toEqual({
        categoryId: 'c1',
        code: 'DELIVERY',
        name: '배송',
        calls: 10,
        avgTalkSeconds: 61,
        negativeCalls: 4,
      });
      expect(result.categories[1]).toMatchObject({ categoryId: null, calls: 3, avgTalkSeconds: 0 });
    });

    it('직전 같은 길이 구간과 비교해 급상승 키워드를 낸다', async () => {
      const { service } = buildService({
        currentKeywords: [{ keyword: '지연', calls: 12n }, { keyword: '배송', calls: 20n }],
        previousKeywords: [{ keyword: '배송', calls: 19n }],
      });

      const result = await service.query(TENANT_ID, { from: FROM, to: TO, resolution: 'PT1H' });

      expect(result.risingKeywords[0]).toMatchObject({ keyword: '지연', current: 12, previous: 0, delta: 12 });
      expect(result.risingKeywords[1]).toMatchObject({ keyword: '배송', delta: 1 });
    });

    it('키워드 비교 구간은 요청 구간과 길이가 같고 바로 앞이다', async () => {
      const { service, calls } = buildService();

      await service.query(TENANT_ID, { from: FROM, to: TO, resolution: 'PT1H' });

      const keywordCalls = calls.filter((call) => call.text.includes('jsonb_array_elements_text'));
      expect(keywordCalls).toHaveLength(2);
      const previousWindow = keywordCalls[1].values.filter((v) => v instanceof Date) as Date[];
      expect(previousWindow[0].toISOString()).toBe('2026-08-31T00:00:00.000Z');
      expect(previousWindow[1].toISOString()).toBe('2026-09-01T00:00:00.000Z');
    });

    it('분석 커버리지를 함께 준다', async () => {
      const { service } = buildService({ coverage: [{ totalCalls: 120n, analyzedCalls: 90n }] });

      const result = await service.query(TENANT_ID, { from: FROM, to: TO, resolution: 'PT1H' });

      expect(result.totals).toMatchObject({ totalCalls: 120, analyzedCalls: 90 });
    });

    it('분석된 통화가 없어도 빈 껍데기를 준다', async () => {
      const { service } = buildService();

      const result = await service.query(TENANT_ID, { from: FROM, to: TO, resolution: 'P1D' });

      expect(result.categories).toEqual([]);
      expect(result.risingKeywords).toEqual([]);
      expect(result.totals.analyzedCalls).toBe(0);
      expect(result.sentimentSeries).toHaveLength(1);
    });
  });

  it('모든 집계 쿼리에 테넌트를 넣는다', async () => {
    const { service, calls } = buildService();

    await service.query(TENANT_ID, { from: FROM, to: TO, resolution: 'PT1H' });

    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const call of calls) {
      expect(call.values).toContain(TENANT_ID);
    }
  });
});
