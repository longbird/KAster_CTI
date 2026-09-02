import { describe, expect, it } from 'vitest';
import { describeOutcome, toMappingObject, toMappingRows } from './requestMapping';

describe('toMappingRows', () => {
  it('저장된 매핑을 편집 가능한 줄로 편다', () => {
    expect(toMappingRows({ phone: 'CALLER', src: 'LITERAL:kaster' })).toEqual([
      { name: 'phone', source: 'CALLER', literal: '' },
      { name: 'src', source: 'LITERAL', literal: 'kaster' },
    ]);
  });

  it('빈 고정값도 고정값이다', () => {
    expect(toMappingRows({ x: 'LITERAL:' })).toEqual([{ name: 'x', source: 'LITERAL', literal: '' }]);
  });

  it('없거나 객체가 아니면 빈 목록이다', () => {
    expect(toMappingRows(null)).toEqual([]);
    expect(toMappingRows(undefined)).toEqual([]);
  });
});

describe('toMappingObject', () => {
  it('편집한 줄을 서버가 받는 모양으로 되돌린다', () => {
    expect(
      toMappingObject([
        { name: 'phone', source: 'CALLER', literal: '' },
        { name: 'src', source: 'LITERAL', literal: 'kaster' },
      ]),
    ).toEqual({ phone: 'CALLER', src: 'LITERAL:kaster' });
  });

  it('이름이 빈 줄은 버린다 — 편집 중 만들어진 빈 줄을 보내지 않는다', () => {
    expect(toMappingObject([{ name: '  ', source: 'CALLER', literal: '' }])).toEqual({});
  });

  it('이름 앞뒤 공백을 없앤다', () => {
    expect(toMappingObject([{ name: ' phone ', source: 'CALLER', literal: '' }])).toEqual({ phone: 'CALLER' });
  });

  it('왕복해도 같다', () => {
    const mapping = { phone: 'CALLER', custNo: 'COLLECTED', src: 'LITERAL:kaster' };

    expect(toMappingObject(toMappingRows(mapping))).toEqual(mapping);
  });
});

describe('describeOutcome', () => {
  it('맞으면 꺼낸 값을 보여준다', () => {
    const summary = describeOutcome({ status: 'MATCH', value: 'VIP', durationMs: 120, httpStatus: 200 });

    expect(summary.tone).toBe('success');
    expect(summary.detail).toContain('VIP');
    expect(summary.title).toContain('120ms');
  });

  it('안 맞는 것은 실패가 아니라고 분명히 말한다', () => {
    const summary = describeOutcome({ status: 'NOMATCH', value: '', durationMs: 90 });

    expect(summary.tone).toBe('warning');
    expect(summary.detail).toContain('정상');
  });

  it('실패는 이유를 그대로 보여준다', () => {
    const summary = describeOutcome({
      status: 'ERROR', value: '', durationMs: 2000, reason: 'lookup timed out',
    });

    expect(summary.tone).toBe('error');
    expect(summary.detail).toBe('lookup timed out');
  });

  it('이유가 없어도 빈 화면을 만들지 않는다', () => {
    expect(describeOutcome({ status: 'ERROR', value: '', durationMs: 10 }).detail).toBeTruthy();
  });
});
