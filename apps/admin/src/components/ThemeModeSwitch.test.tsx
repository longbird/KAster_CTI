import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ThemeModeSwitch } from './ThemeModeSwitch';

vi.mock('../store/useThemeStore', () => ({
  useThemeStore: (selector: (state: unknown) => unknown) =>
    selector({
      pref: 'dark',
      setPref: vi.fn(),
    }),
}));

describe('ThemeModeSwitch', () => {
  it('offers system, light, and dark modes from the admin header', () => {
    const html = renderToStaticMarkup(<ThemeModeSwitch />);

    expect(html).toContain('theme-mode-switch');
    expect(html).toContain('시스템');
    expect(html).toContain('라이트');
    expect(html).toContain('다크');
  });
});
