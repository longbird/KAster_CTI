import { create } from 'zustand';

// conv 12·13: 상담원 앱은 두 가지 운영 모드를 지원한다.
//  - 'mini': 대리운전 관리 프로그램 같은 별도 CRM 이 메인일 때 쓰는 작은 컨트롤 패널
//  - 'full': CTI 앱 안에서 고객/메모/후처리까지 다 처리하는 전체 화면
// URL `?mode=mini` 또는 localStorage 로 영속, 기본은 full.
export type WorkspaceMode = 'mini' | 'full';
export type FullWorkspaceSection = 'overview' | 'call' | 'queues' | 'history';
export type ThemeMode = 'light' | 'dark';

const LS_KEY = 'kaster.workspace_mode';
const LS_SECTION_KEY = 'kaster.full_section';
const LS_THEME_KEY = 'kaster.theme_mode';

function detectInitialMode(): WorkspaceMode {
  if (typeof window === 'undefined') return 'full';
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('mode');
    if (fromUrl === 'mini' || fromUrl === 'full') return fromUrl;
    const stored = localStorage.getItem(LS_KEY);
    if (stored === 'mini' || stored === 'full') return stored;
  } catch {
    // noop
  }
  return 'full';
}

interface UiState {
  mode: WorkspaceMode;
  fullSection: FullWorkspaceSection;
  themeMode: ThemeMode;
  setMode: (mode: WorkspaceMode) => void;
  setFullSection: (section: FullWorkspaceSection) => void;
  setThemeMode: (themeMode: ThemeMode) => void;
}

function detectInitialSection(): FullWorkspaceSection {
  if (typeof window === 'undefined') return 'overview';
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('section');
    if (fromUrl === 'overview' || fromUrl === 'call' || fromUrl === 'queues' || fromUrl === 'history') {
      return fromUrl;
    }
    const stored = localStorage.getItem(LS_SECTION_KEY);
    if (stored === 'overview' || stored === 'call' || stored === 'queues' || stored === 'history') {
      return stored;
    }
  } catch {
    // noop
  }
  return 'overview';
}

function detectInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = localStorage.getItem(LS_THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch {
    // noop
  }
  return 'light';
}

export const useUiStore = create<UiState>((set) => ({
  mode: detectInitialMode(),
  fullSection: detectInitialSection(),
  themeMode: detectInitialTheme(),
  setMode: (mode) => {
    try {
      localStorage.setItem(LS_KEY, mode);
    } catch {
      // noop
    }
    set({ mode });
  },
  setFullSection: (fullSection) => {
    try {
      localStorage.setItem(LS_SECTION_KEY, fullSection);
    } catch {
      // noop
    }
    set({ fullSection });
  },
  setThemeMode: (themeMode) => {
    try {
      localStorage.setItem(LS_THEME_KEY, themeMode);
    } catch {
      // noop
    }
    set({ themeMode });
  },
}));
