/**
 * 추이 차트의 좌표 계산.
 *
 * 차트 라이브러리를 쓰지 않는다. 관리자 앱에 차트 의존성이 없고, 필요한 것이
 * 선과 누적 영역뿐이라 SVG 로 충분하다.
 *
 * 이 파일의 존재 이유는 <b>null 을 건너뛰지 않고 끊는 것</b>이다. 안 잰 구간을
 * 이어 그리면 없는 데이터를 그린 것이 되고, 화면을 보는 사람은 그때 값이
 * 그랬다고 믿는다.
 */

export type TrendResolution = 'PT1M' | 'PT5M' | 'PT1H' | 'P1D';

export interface SeriesValue {
  at: string;
  value: number | null;
}

export interface Box {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
  index: number;
}

export interface Segment {
  points: Point[];
}

function xAt(index: number, count: number, width: number): number {
  // 점이 하나면 나눌 것이 없다. 0 으로 나누면 NaN 이 path 에 들어가 통째로 사라진다.
  if (count <= 1) return 0;
  return (index / (count - 1)) * width;
}

/** 값이 이어지는 구간마다 하나씩. null 에서 끊는다. */
export function buildSegments(values: SeriesValue[], max: number, box: Box): Segment[] {
  const segments: Segment[] = [];
  let current: Point[] = [];

  values.forEach((item, index) => {
    if (item.value === null || item.value === undefined) {
      if (current.length) segments.push({ points: current });
      current = [];
      return;
    }
    current.push({
      x: xAt(index, values.length, box.width),
      y: box.height - (item.value / max) * box.height,
      index,
    });
  });

  if (current.length) segments.push({ points: current });
  return segments;
}

export interface StackInput {
  key: string;
  values: SeriesValue[];
}

export interface StackAreaPoint {
  x: number;
  y0: number;
  y1: number;
  index: number;
}

export interface StackedSeries {
  key: string;
  areas: Array<{ points: StackAreaPoint[] }>;
}

/**
 * 누적 영역. 상담원 상태처럼 "합이 곧 전체"인 계열에 쓴다.
 *
 * 스케일은 <b>구간별 합계의 최대</b>로 잡는다. 계열별 최대로 잡으면 쌓았을 때
 * 위가 잘린다.
 */
export function buildStackSegments(series: StackInput[], box: Box): StackedSeries[] {
  const length = series[0]?.values.length ?? 0;
  const totals = Array.from({ length }, (_, index) =>
    series.reduce((sum, item) => sum + (item.values[index]?.value ?? 0), 0),
  );
  const max = niceMax(Math.max(0, ...totals));

  const baseline = new Array(length).fill(box.height);

  return series.map((item) => {
    const areas: Array<{ points: StackAreaPoint[] }> = [];
    let current: StackAreaPoint[] = [];

    for (let index = 0; index < length; index += 1) {
      const value = item.values[index]?.value;
      if (value === null || value === undefined) {
        if (current.length) areas.push({ points: current });
        current = [];
        continue;
      }
      const y0 = baseline[index];
      const y1 = y0 - (value / max) * box.height;
      baseline[index] = y1;
      current.push({ x: xAt(index, length, box.width), y0, y1, index });
    }

    if (current.length) areas.push({ points: current });
    return { key: item.key, areas };
  });
}

/** 눈금이 읽기 좋은 값으로 올린다. 41 -> 50, 180 -> 200. */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10];
  const step = steps.find((candidate) => value <= candidate * magnitude) ?? 10;
  return step * magnitude;
}

/** x축 라벨을 붙일 인덱스. 너무 촘촘하면 글자가 겹친다. */
export function pickTickIndexes(count: number, maxTicks: number): number[] {
  if (count <= 0) return [];
  if (count <= maxTicks) return Array.from({ length: count }, (_, index) => index);
  const step = Math.ceil(count / maxTicks);
  const ticks: number[] = [];
  for (let index = 0; index < count; index += step) ticks.push(index);
  return ticks;
}

const pad = (value: number) => String(value).padStart(2, '0');

export function formatAxisTime(at: string, resolution: TrendResolution): string {
  const date = new Date(at);
  if (resolution === 'P1D') return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
  if (resolution === 'PT1H') return `${pad(date.getHours())}시`;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
