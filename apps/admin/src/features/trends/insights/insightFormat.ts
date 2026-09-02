export interface RisingKeyword {
  keyword: string;
  current: number;
  previous: number;
  delta: number;
  /** 직전 구간에 없던 키워드는 비율을 낼 수 없어 null 이다. */
  changeRate: number | null;
}

/** 급상승 키워드의 변화율 표기. 직전 구간에 없던 키워드는 비율 대신 '신규'로 쓴다. */
export function formatChangeRate(changeRate: number | null): string {
  if (changeRate === null) return '신규';
  return `+${Math.round(changeRate * 100)}%`;
}

/** 분석이 통화를 얼마나 덮는지. 통화가 0건이면 비율을 낼 수 없다. */
export function computeCoverageRate(analyzedCalls: number, totalCalls: number): number | null {
  if (!Number.isFinite(totalCalls) || totalCalls <= 0) return null;
  return Math.min(1, analyzedCalls / totalCalls);
}
