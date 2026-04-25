import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePref = 'system' | 'light' | 'dark';
export type ThemeResolved = 'light' | 'dark';

function resolve(pref: ThemePref): ThemeResolved {
  if (pref === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return pref;
}

interface ThemeState {
  pref: ThemePref;
  resolved: ThemeResolved;
  setPref: (p: ThemePref) => void;
  reresolve: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      pref: 'dark',
      resolved: 'dark',
      setPref: (p) => {
        const resolved = resolve(p);
        set({ pref: p, resolved });
      },
      reresolve: () => {
        const pref = get().pref;
        set({ resolved: resolve(pref) });
      },
    }),
    {
      name: 'kaster.admin.theme',
      partialize: (s) => ({ pref: s.pref }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.resolved = resolve(state.pref);
        }
      },
    },
  ),
);

export function initThemeWatcher() {
  const apply = () => {
    const resolved = useThemeStore.getState().resolved;
    document.documentElement.setAttribute('data-theme', resolved);
  };
  apply();
  useThemeStore.subscribe(apply);

  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      if (useThemeStore.getState().pref === 'system') {
        useThemeStore.getState().reresolve();
      }
    };
    mq.addEventListener?.('change', onChange);
  }
}
