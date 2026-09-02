import { describe, expect, it } from 'vitest';
import { describeDiffSummary, describeLineDelta, resolveApplyGate } from './applyGate';

const OK_VALIDATION = { checks: [{ name: 'a', status: 'pass' as const, detail: '' }] };
const FAIL_VALIDATION = {
  checks: [
    { name: 'a', status: 'pass' as const, detail: '' },
    { name: 'b', status: 'fail' as const, detail: 'pjsip.conf 가 비었다' },
  ],
};
const CHANGED = [{ fileName: 'extensions_inbound.conf', status: 'changed' as const, addedLines: 3, removedLines: 1 }];
const UNCHANGED = [{ fileName: 'extensions_inbound.conf', status: 'unchanged' as const, addedLines: 0, removedLines: 0 }];

describe('resolveApplyGate', () => {
  it('변경 내역을 아직 안 봤으면 적용할 수 없다', () => {
    const gate = resolveApplyGate({ reviewed: false, diff: CHANGED, validation: OK_VALIDATION, canOperate: true });

    expect(gate.canApply).toBe(false);
    expect(gate.reason).toMatch(/변경 내역/);
  });

  it('보고 나면 적용할 수 있다', () => {
    const gate = resolveApplyGate({ reviewed: true, diff: CHANGED, validation: OK_VALIDATION, canOperate: true });

    expect(gate.canApply).toBe(true);
    expect(gate.reason).toBeNull();
  });

  it('검증에 실패한 항목이 있으면 적용할 수 없다', () => {
    const gate = resolveApplyGate({ reviewed: true, diff: CHANGED, validation: FAIL_VALIDATION, canOperate: true });

    expect(gate.canApply).toBe(false);
    expect(gate.reason).toContain('pjsip.conf 가 비었다');
  });

  it('바뀌는 것이 없으면 적용할 이유가 없다', () => {
    const gate = resolveApplyGate({ reviewed: true, diff: UNCHANGED, validation: OK_VALIDATION, canOperate: true });

    expect(gate.canApply).toBe(false);
    expect(gate.reason).toMatch(/바뀌는 파일이 없/);
  });

  it('조작 권한이 없으면 적용할 수 없다', () => {
    const gate = resolveApplyGate({ reviewed: true, diff: CHANGED, validation: OK_VALIDATION, canOperate: false });

    expect(gate.canApply).toBe(false);
    expect(gate.reason).toMatch(/권한/);
  });

  // 권한 없음이 가장 먼저다. 권한이 없는 사람에게 "먼저 확인하세요" 라고 하면 안내가 틀린다.
  it('권한 없음을 다른 이유보다 먼저 알린다', () => {
    const gate = resolveApplyGate({ reviewed: false, diff: UNCHANGED, validation: FAIL_VALIDATION, canOperate: false });

    expect(gate.reason).toMatch(/권한/);
  });

  it('아직 diff 를 못 받았으면 적용할 수 없다', () => {
    const gate = resolveApplyGate({ reviewed: true, diff: null, validation: null, canOperate: true });

    expect(gate.canApply).toBe(false);
  });
});

describe('describeDiffSummary', () => {
  it('바뀌는 파일만 센다', () => {
    expect(describeDiffSummary([...CHANGED, ...UNCHANGED])).toBe('1개 파일 변경 · +3 / -1');
  });

  it('여러 파일의 증감을 합친다', () => {
    const summary = describeDiffSummary([
      { fileName: 'a.conf', status: 'changed', addedLines: 2, removedLines: 5 },
      { fileName: 'b.conf', status: 'missing-current', addedLines: 10, removedLines: 0 },
    ]);

    expect(summary).toBe('2개 파일 변경 · +12 / -5');
  });

  it('바뀌는 것이 없으면 그렇게 말한다', () => {
    expect(describeDiffSummary(UNCHANGED)).toBe('바뀌는 파일이 없습니다');
  });

  it('아직 못 받았으면 빈 문자열', () => {
    expect(describeDiffSummary(null)).toBe('');
  });
});

describe('describeLineDelta', () => {
  it('증감이 있으면 그대로 보여준다', () => {
    expect(describeLineDelta({ fileName: 'a', status: 'changed', addedLines: 3, removedLines: 1 }))
      .toBe('+3 / -1');
  });

  // dialplan 에서 순서는 의미가 있다. "동일" 로 뭉개면 안 된다.
  it('줄 집합이 같으면 순서·공백 차이라고 말한다', () => {
    expect(describeLineDelta({ fileName: 'a', status: 'changed', addedLines: 0, removedLines: 0 }))
      .toBe('순서·공백만 다름');
  });

  it('동일한 파일은 대시로 표시한다', () => {
    expect(describeLineDelta({ fileName: 'a', status: 'unchanged', addedLines: 0, removedLines: 0 }))
      .toBe('-');
  });

  it('신규 파일도 증감으로 보여준다', () => {
    expect(describeLineDelta({ fileName: 'a', status: 'missing-current', addedLines: 12, removedLines: 0 }))
      .toBe('+12 / -0');
  });
});
