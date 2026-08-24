import {
  buildInternalExtensionPatterns,
  isInternalExtension,
  isShadowedByInternalPattern,
} from './internal-extension-pattern';

describe('buildInternalExtensionPatterns', () => {
  it('3301 번대가 내선 패턴에 들어간다 — 전화기끼리 걸리지 않던 원인', () => {
    // 2026-08-24 현장 구성: 3301~3304 는 예전 `_[12]XXX` 에 걸리지 않아 호가 즉시 끊겼다.
    expect(buildInternalExtensionPatterns(['1001', '1002', '2001', '3301', '3302', '3303', '3304']))
      .toEqual(['_[123]XXX']);
  });

  it('첫 자리가 하나뿐이면 문자 클래스를 만들지 않는다', () => {
    expect(buildInternalExtensionPatterns(['1001', '1002'])).toEqual(['_1XXX']);
  });

  it('자릿수가 다르면 패턴을 나눈다', () => {
    expect(buildInternalExtensionPatterns(['101', '3301', '55555']))
      .toEqual(['_1XX', '_3XXX', '_5XXXX']);
  });

  it('0 으로 시작하는 내선은 외부 발신 패턴과 다투므로 제외한다', () => {
    expect(buildInternalExtensionPatterns(['0100', '3301'])).toEqual(['_3XXX']);
  });

  it('숫자가 아닌 값과 빈 값은 무시한다', () => {
    expect(buildInternalExtensionPatterns(['3301', '', '  ', 'abc', '12a4'])).toEqual(['_3XXX']);
  });

  it('내선이 하나도 없으면 패턴도 없다 — 빈 exten 줄을 뱉지 않는다', () => {
    expect(buildInternalExtensionPatterns([])).toEqual([]);
  });

  it('같은 첫 자리가 여러 번 나와도 한 번만 넣는다', () => {
    expect(buildInternalExtensionPatterns(['3301', '3302', '3303'])).toEqual(['_3XXX']);
  });
});

describe('isInternalExtension', () => {
  const extensions = ['1001', '3301'];

  it('실제 내선이면 참이다', () => {
    expect(isInternalExtension('3301', extensions)).toBe(true);
  });

  it('대역만 같고 존재하지 않으면 거짓이다 — 트렁크로 나가야 한다', () => {
    expect(isInternalExtension('3399', extensions)).toBe(false);
  });

  it('외부 번호는 거짓이다', () => {
    expect(isInternalExtension('01012345678', extensions)).toBe(false);
  });
});

describe('isShadowedByInternalPattern', () => {
  const extensions = ['1001', '2001', '3301'];

  it('내선에 없어도 같은 자릿수·같은 첫 자리면 패턴이 먼저 잡아간다', () => {
    // _[123]XXX 가 열려 있어 3999 는 단축번호로 못 쓴다.
    expect(isShadowedByInternalPattern('3999', extensions)).toBe(true);
  });

  it('실제 내선과 같은 코드는 당연히 막힌다', () => {
    expect(isShadowedByInternalPattern('1001', extensions)).toBe(true);
  });

  it('자릿수가 다르면 안 겹친다', () => {
    expect(isShadowedByInternalPattern('300', extensions)).toBe(false);
    expect(isShadowedByInternalPattern('33010', extensions)).toBe(false);
  });

  it('첫 자리가 다르면 안 겹친다', () => {
    expect(isShadowedByInternalPattern('9999', extensions)).toBe(false);
  });

  it('*# 이 섞인 코드는 내선 패턴과 겹치지 않는다', () => {
    expect(isShadowedByInternalPattern('*123', extensions)).toBe(false);
    expect(isShadowedByInternalPattern('#9', extensions)).toBe(false);
  });

  it('내선이 없으면 아무 코드도 막지 않는다', () => {
    expect(isShadowedByInternalPattern('1001', [])).toBe(false);
  });
});
