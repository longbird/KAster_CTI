import { describe, expect, it } from 'vitest';

import { resolveTheme } from './theme';

describe('화면 밝기 모드', () => {
  // 'system' 일 때만 OS 설정을 본다. 야간 상담석에서 OS 는 밝게 두고
  // 소프트폰만 어둡게 쓰는 경우가 있어 앱 설정이 OS 를 이겨야 한다.
  it('system 은 OS 설정을 따른다', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it.each([true, false])('light 는 OS 가 다크(%s)여도 밝게 둔다', (osDark) => {
    expect(resolveTheme('light', osDark)).toBe('light');
  });

  it.each([true, false])('dark 는 OS 가 다크(%s)여도 어둡게 둔다', (osDark) => {
    expect(resolveTheme('dark', osDark)).toBe('dark');
  });
});
