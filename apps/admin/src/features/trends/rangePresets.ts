/**
 * 기간 프리셋.
 *
 * 경계 계산은 손으로 하면 틀린다. 특히 "어제"는 <b>어제 0시부터 오늘 0시까지</b>여야
 * 하고, "오늘"의 끝은 지금이 아니라 <b>다음 분</b>이어야 한다 — 지금으로 자르면
 * 진행 중인 버킷이 절반만 담긴 채 완성된 것처럼 그려진다.
 */
export type RangePresetKey = 'today' | 'yesterday' | 'last7d' | 'last30d';

export const RANGE_PRESETS: Array<{ key: RangePresetKey; label: string }> = [
  { key: 'today', label: '오늘' },
  { key: 'yesterday', label: '어제' },
  { key: 'last7d', label: '7일' },
  { key: 'last30d', label: '30일' },
];

export interface ResolvedRange {
  from: string;
  to: string;
}

function startOfDay(at: Date): Date {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(at: Date, days: number): Date {
  const date = new Date(at);
  date.setDate(date.getDate() + days);
  return date;
}

/** 진행 중인 분은 아직 끝나지 않았다. 다음 분 경계까지 요청해 그 버킷을 포함시킨다. */
function nextMinute(at: Date): Date {
  const date = new Date(at);
  date.setSeconds(0, 0);
  date.setMinutes(date.getMinutes() + 1);
  return date;
}

export function resolveRange(preset: RangePresetKey, now: Date = new Date()): ResolvedRange {
  const today = startOfDay(now);

  switch (preset) {
    case 'yesterday':
      return { from: addDays(today, -1).toISOString(), to: today.toISOString() };
    case 'last7d':
      return { from: addDays(today, -6).toISOString(), to: nextMinute(now).toISOString() };
    case 'last30d':
      return { from: addDays(today, -29).toISOString(), to: nextMinute(now).toISOString() };
    case 'today':
    default:
      return { from: today.toISOString(), to: nextMinute(now).toISOString() };
  }
}
