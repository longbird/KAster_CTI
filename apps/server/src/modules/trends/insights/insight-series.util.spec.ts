import { computeRisingKeywords, fillSentimentSeries } from './insight-series.util';

describe('fillSentimentSeries', () => {
  const from = new Date('2026-09-01T00:00:00Z');
  const to = new Date('2026-09-01T03:00:00Z');

  it('빈 구간을 0 으로 채운다', () => {
    const series = fillSentimentSeries(from, to, 'PT1H', [
      { at: new Date('2026-09-01T01:00:00Z'), positive: 2, neutral: 1, negative: 3 },
    ]);

    expect(series).toHaveLength(3);
    expect(series[0]).toEqual({ at: new Date('2026-09-01T00:00:00Z'), positive: 0, neutral: 0, negative: 0, total: 0 });
    expect(series[1]).toEqual({ at: new Date('2026-09-01T01:00:00Z'), positive: 2, neutral: 1, negative: 3, total: 6 });
    expect(series[2].total).toBe(0);
  });

  // 스냅샷 축과 달리 여기서 0 은 "분석된 통화가 없었다"는 사실이다. null 이 아니다.
  it('분석 건이 없는 구간도 0 으로 남긴다', () => {
    const series = fillSentimentSeries(from, to, 'PT1H', []);

    expect(series.map((point) => point.total)).toEqual([0, 0, 0]);
  });

  it('버킷 경계 밖의 행은 버린다', () => {
    const series = fillSentimentSeries(from, to, 'PT1H', [
      { at: new Date('2026-09-01T09:00:00Z'), positive: 5, neutral: 0, negative: 0 },
    ]);

    expect(series.every((point) => point.total === 0)).toBe(true);
  });

  it('버킷 시작에 맞지 않는 시각도 그 버킷으로 접는다', () => {
    const series = fillSentimentSeries(from, to, 'PT1H', [
      { at: new Date('2026-09-01T01:42:00Z'), positive: 1, neutral: 0, negative: 0 },
    ]);

    expect(series[1].positive).toBe(1);
  });

  it('같은 버킷의 행이 여러 개면 더한다', () => {
    const series = fillSentimentSeries(from, to, 'PT1H', [
      { at: new Date('2026-09-01T01:10:00Z'), positive: 1, neutral: 0, negative: 0 },
      { at: new Date('2026-09-01T01:50:00Z'), positive: 2, neutral: 1, negative: 0 },
    ]);

    expect(series[1]).toMatchObject({ positive: 3, neutral: 1, negative: 0, total: 4 });
  });
});

describe('computeRisingKeywords', () => {
  const options = { limit: 5, minCalls: 2 };

  it('증가폭이 큰 순서로 준다', () => {
    const rising = computeRisingKeywords(
      [
        { keyword: '배송', calls: 30 },
        { keyword: '환불', calls: 12 },
      ],
      [
        { keyword: '배송', calls: 28 },
        { keyword: '환불', calls: 2 },
      ],
      options,
    );

    expect(rising.map((row) => row.keyword)).toEqual(['환불', '배송']);
    expect(rising[0]).toMatchObject({ current: 12, previous: 2, delta: 10, changeRate: 5 });
  });

  it('직전 기간에 없던 키워드는 변화율을 null 로 둔다', () => {
    const rising = computeRisingKeywords([{ keyword: '지연', calls: 7 }], [], options);

    expect(rising[0]).toMatchObject({ keyword: '지연', previous: 0, delta: 7, changeRate: null });
  });

  it('줄어든 키워드는 빼고 준다', () => {
    const rising = computeRisingKeywords(
      [{ keyword: '배송', calls: 3 }],
      [{ keyword: '배송', calls: 10 }],
      options,
    );

    expect(rising).toEqual([]);
  });

  it('변화가 없는 키워드도 뺀다', () => {
    const rising = computeRisingKeywords(
      [{ keyword: '배송', calls: 5 }],
      [{ keyword: '배송', calls: 5 }],
      options,
    );

    expect(rising).toEqual([]);
  });

  it('최소 건수에 못 미치면 노이즈로 보고 버린다', () => {
    const rising = computeRisingKeywords([{ keyword: '오타', calls: 1 }], [], options);

    expect(rising).toEqual([]);
  });

  it('직전 기간에만 있던 키워드는 나오지 않는다', () => {
    const rising = computeRisingKeywords([], [{ keyword: '사라짐', calls: 40 }], options);

    expect(rising).toEqual([]);
  });

  it('상한만큼만 준다', () => {
    const current = Array.from({ length: 10 }, (_, index) => ({
      keyword: `k${index}`,
      calls: 10 + index,
    }));

    expect(computeRisingKeywords(current, [], options)).toHaveLength(5);
  });

  it('증가폭이 같으면 현재 건수, 그다음 이름순으로 안정 정렬한다', () => {
    const rising = computeRisingKeywords(
      [
        { keyword: 'b', calls: 5 },
        { keyword: 'a', calls: 5 },
        { keyword: 'c', calls: 9 },
      ],
      [{ keyword: 'c', calls: 4 }],
      options,
    );

    expect(rising.map((row) => row.keyword)).toEqual(['c', 'a', 'b']);
  });
});
