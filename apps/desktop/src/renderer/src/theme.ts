import type { DesktopThemeMode } from '../../shared/ipc';

export type ResolvedTheme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * 'system' 일 때만 OS 설정을 따른다.
 *
 * 예전에는 CSS 가 @media (prefers-color-scheme: dark) 하나만 갖고 있어서
 * 앱에서 밝기를 고를 방법이 없었다. 야간 상담석에서 OS 는 밝게 두고 소프트폰만
 * 어둡게 쓰고 싶어도 방법이 없었다.
 */
export function resolveTheme(mode: DesktopThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'system') {
    return prefersDark ? 'dark' : 'light';
  }
  return mode;
}

export function prefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DARK_QUERY).matches
    : false;
}

export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolved;
}

/**
 * 모드를 반영하고, 'system' 인 동안에는 OS 설정 변화도 따라간다.
 * 정리 함수를 돌려주므로 effect 에서 그대로 쓸 수 있다.
 */
export function watchTheme(mode: DesktopThemeMode): () => void {
  applyTheme(resolveTheme(mode, prefersDark()));

  if (mode !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }

  const media = window.matchMedia(DARK_QUERY);
  const onChange = (event: MediaQueryListEvent) => {
    applyTheme(resolveTheme('system', event.matches));
  };
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
