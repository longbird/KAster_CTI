import { describe, expect, it } from 'vitest';
import { buildSegments, buildStackSegments, niceMax, pickTickIndexes, formatAxisTime } from './trendSeries';

const P = (values: (number | null)[]) =>
  values.map((value, index) => ({ at: new Date(2026, 7, 25, 9, index).toISOString(), value }));

describe('buildSegments', () => {
  it('값이 이어지면 한 덩어리다', () => {
    const segments = buildSegments(P([1, 2, 3]), 10, { width: 300, height: 100 });

    expect(segments).toHaveLength(1);
    expect(segments[0].points).toHaveLength(3);
  });

  it('null 에서 선을 끊는다 — 안 잰 구간을 이으면 없는 데이터를 그린 것이 된다', () => {
    const segments = buildSegments(P([1, 2, null, 4, 5]), 10, { width: 300, height: 100 });

    expect(segments).toHaveLength(2);
    expect(segments[0].points).toHaveLength(2);
    expect(segments[1].points).toHaveLength(2);
  });

  it('전부 null 이면 그릴 것이 없다', () => {
    expect(buildSegments(P([null, null]), 10, { width: 300, height: 100 })).toEqual([]);
  });

  it('값 하나만 남은 구간도 점으로 남긴다 — 사라지면 데이터가 없는 것처럼 보인다', () => {
    const segments = buildSegments(P([null, 5, null]), 10, { width: 300, height: 100 });

    expect(segments).toHaveLength(1);
    expect(segments[0].points).toHaveLength(1);
  });

  it('y 는 위가 크다 — 최대값이 0, 0이 높이', () => {
    const [segment] = buildSegments(P([10, 0]), 10, { width: 300, height: 100 });

    expect(segment.points[0].y).toBe(0);
    expect(segment.points[1].y).toBe(100);
  });

  it('x 는 구간 전체에 고르게 편다', () => {
    const [segment] = buildSegments(P([1, 1, 1]), 10, { width: 300, height: 100 });

    expect(segment.points.map((point) => point.x)).toEqual([0, 150, 300]);
  });

  it('점이 하나뿐이면 x 는 0 이다 — 0 으로 나누지 않는다', () => {
    const [segment] = buildSegments(P([3]), 10, { width: 300, height: 100 });

    expect(segment.points[0].x).toBe(0);
    expect(Number.isNaN(segment.points[0].x)).toBe(false);
  });
});

describe('buildStackSegments', () => {
  it('여러 계열을 아래부터 쌓는다', () => {
    const stacked = buildStackSegments(
      [
        { key: 'a', values: P([1, 1]) },
        { key: 'b', values: P([2, 2]) },
      ],
      { width: 100, height: 90 },
    );

    // 합계 3 -> 눈금은 읽기 좋은 5 로 올라간다. a(1) 는 바닥에서 1/5, b(2) 는 그 위 2/5.
    expect(stacked[0].key).toBe('a');
    expect(stacked[0].areas[0].points[0].y0).toBe(90);
    expect(stacked[0].areas[0].points[0].y1).toBe(72);
    expect(stacked[1].areas[0].points[0].y0).toBe(72);
    expect(stacked[1].areas[0].points[0].y1).toBe(36);
  });

  it('스케일은 계열별 최대가 아니라 구간 합계의 최대로 잡는다 — 아니면 위가 잘린다', () => {
    const stacked = buildStackSegments(
      [
        { key: 'a', values: P([5, 0]) },
        { key: 'b', values: P([5, 0]) },
      ],
      { width: 100, height: 100 },
    );

    // 계열별 최대(5)로 잡았다면 b 의 꼭대기가 음수가 되어 박스를 벗어난다.
    expect(stacked[1].areas[0].points[0].y1).toBeGreaterThanOrEqual(0);
  });

  it('전부 null 인 구간에서 면을 끊는다', () => {
    const stacked = buildStackSegments(
      [{ key: 'a', values: P([1, null, 1]) }],
      { width: 100, height: 90 },
    );

    expect(stacked[0].areas).toHaveLength(2);
  });

  it('합계가 0 이면 바닥에 붙인다 — 0으로 나누지 않는다', () => {
    const stacked = buildStackSegments([{ key: 'a', values: P([0, 0]) }], { width: 100, height: 90 });

    expect(stacked[0].areas[0].points.every((point) => point.y0 === 90 && point.y1 === 90)).toBe(true);
  });
});

describe('niceMax', () => {
  it('눈금이 읽기 좋은 값으로 올린다', () => {
    expect(niceMax(7)).toBe(10);
    expect(niceMax(12)).toBe(20);
    expect(niceMax(41)).toBe(50);
    expect(niceMax(180)).toBe(200);
  });

  it('0 이나 음수는 1 로 둔다 — 축이 무너지지 않게', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(-3)).toBe(1);
  });
});

describe('pickTickIndexes', () => {
  it('개수가 적으면 전부 고른다', () => {
    expect(pickTickIndexes(4, 6)).toEqual([0, 1, 2, 3]);
  });

  it('많으면 고르게 솎는다', () => {
    const ticks = pickTickIndexes(100, 5);

    expect(ticks.length).toBeLessThanOrEqual(5);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeLessThan(100);
  });

  it('빈 구간은 빈 배열이다', () => {
    expect(pickTickIndexes(0, 5)).toEqual([]);
  });
});

describe('formatAxisTime', () => {
  const at = new Date(2026, 7, 25, 9, 7).toISOString();

  it('분 해상도는 시:분', () => {
    expect(formatAxisTime(at, 'PT1M')).toBe('09:07');
    expect(formatAxisTime(at, 'PT5M')).toBe('09:07');
  });

  it('시간 해상도는 시', () => {
    expect(formatAxisTime(at, 'PT1H')).toBe('09시');
  });

  it('일 해상도는 월/일', () => {
    expect(formatAxisTime(at, 'P1D')).toBe('08/25');
  });
});
