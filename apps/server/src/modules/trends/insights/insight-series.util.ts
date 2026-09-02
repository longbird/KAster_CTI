import { SnapshotResolution, floorToResolution } from '../snapshot-rollup';
import { buildBucketStarts } from '../trend-series';

export interface SentimentBucketRow {
  at: Date;
  positive: number;
  neutral: number;
  negative: number;
}

export interface SentimentPoint extends SentimentBucketRow {
  total: number;
}

export interface KeywordCount {
  keyword: string;
  calls: number;
}

export interface RisingKeyword {
  keyword: string;
  current: number;
  previous: number;
  delta: number;
  /** 직전 기간에 없던 키워드는 비율을 낼 수 없으므로 null 이다 (무한대가 아니다). */
  changeRate: number | null;
}

export interface RisingKeywordOptions {
  limit: number;
  minCalls: number;
}

/**
 * 감정 집계를 요청 구간 전체 버킷으로 채운다.
 *
 * 스냅샷 축은 값이 없으면 null 이지만(적재 이전인지 0인지 구분해야 한다),
 * 여기서 0 은 "그 구간에 분석된 통화가 없었다"는 사실이므로 0 으로 채운다.
 */
export function fillSentimentSeries(
  from: Date,
  to: Date,
  resolution: SnapshotResolution,
  rows: SentimentBucketRow[],
): SentimentPoint[] {
  const points = new Map<number, SentimentPoint>();
  for (const start of buildBucketStarts(from, to, resolution)) {
    points.set(start.getTime(), {
      at: start,
      positive: 0,
      neutral: 0,
      negative: 0,
      total: 0,
    });
  }

  for (const row of rows) {
    const bucket = points.get(floorToResolution(row.at, resolution).getTime());
    if (!bucket) continue;

    bucket.positive += row.positive;
    bucket.neutral += row.neutral;
    bucket.negative += row.negative;
    bucket.total = bucket.positive + bucket.neutral + bucket.negative;
  }

  return [...points.values()];
}

/**
 * 직전 같은 길이 구간과 비교해 늘어난 키워드만 고른다.
 *
 * 줄어든 키워드는 "급상승"이 아니므로 빼고, 건수가 너무 적은 키워드는
 * 오탈자나 1회성 발화라 노이즈로 본다.
 */
export function computeRisingKeywords(
  current: KeywordCount[],
  previous: KeywordCount[],
  options: RisingKeywordOptions,
): RisingKeyword[] {
  const previousByKeyword = new Map(previous.map((row) => [row.keyword, row.calls]));

  return current
    .filter((row) => row.calls >= options.minCalls)
    .map((row) => {
      const previousCalls = previousByKeyword.get(row.keyword) ?? 0;
      const delta = row.calls - previousCalls;
      return {
        keyword: row.keyword,
        current: row.calls,
        previous: previousCalls,
        delta,
        changeRate: previousCalls > 0 ? delta / previousCalls : null,
      };
    })
    .filter((row) => row.delta > 0)
    .sort(
      (a, b) =>
        b.delta - a.delta || b.current - a.current || a.keyword.localeCompare(b.keyword),
    )
    .slice(0, options.limit);
}
