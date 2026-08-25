import { describe, expect, it } from 'vitest';
import { resolveRange } from './rangePresets';

/** 2026-08-25(화) 09:07:41 을 기준 시각으로 쓴다. */
const NOW = new Date(2026, 7, 25, 9, 7, 41, 500);

const local = (iso: string) => new Date(iso);

describe('resolveRange', () => {
  it('오늘은 0시부터 다음 분까지다 — 진행 중인 분을 잘라내지 않는다', () => {
    const { from, to } = resolveRange('today', NOW);

    expect(local(from).getHours()).toBe(0);
    expect(local(from).getDate()).toBe(25);
    // 09:07:41 -> 09:08:00. 09:07 버킷이 통째로 들어온다.
    expect(local(to).getHours()).toBe(9);
    expect(local(to).getMinutes()).toBe(8);
    expect(local(to).getSeconds()).toBe(0);
  });

  it('어제는 어제 0시부터 오늘 0시까지다 — 오늘이 섞이지 않는다', () => {
    const { from, to } = resolveRange('yesterday', NOW);

    expect(local(from).getDate()).toBe(24);
    expect(local(from).getHours()).toBe(0);
    expect(local(to).getDate()).toBe(25);
    expect(local(to).getHours()).toBe(0);
  });

  it('7일은 오늘 포함 7일이다 — 6일 전 0시부터', () => {
    const { from } = resolveRange('last7d', NOW);

    expect(local(from).getDate()).toBe(19);
    expect(local(from).getHours()).toBe(0);
  });

  it('30일은 29일 전 0시부터다 — 달을 넘어도 맞는다', () => {
    const { from } = resolveRange('last30d', NOW);

    expect(local(from).getMonth()).toBe(6); // 7월
    expect(local(from).getDate()).toBe(27);
  });

  it('from 은 항상 to 보다 앞이다', () => {
    for (const preset of ['today', 'yesterday', 'last7d', 'last30d'] as const) {
      const { from, to } = resolveRange(preset, NOW);
      expect(new Date(from).getTime()).toBeLessThan(new Date(to).getTime());
    }
  });

  it('자정 직후에도 오늘 구간이 무너지지 않는다', () => {
    const justAfterMidnight = new Date(2026, 7, 25, 0, 0, 5);
    const { from, to } = resolveRange('today', justAfterMidnight);

    expect(new Date(from).getTime()).toBeLessThan(new Date(to).getTime());
    expect(local(to).getMinutes()).toBe(1);
  });
});
