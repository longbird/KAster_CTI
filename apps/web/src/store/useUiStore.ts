import { create } from 'zustand';

// conv 12·13: 상담원 앱은 두 가지 운영 모드를 지원한다.
//  - 'mini': 대리운전 관리 프로그램 같은 별도 CRM 이 메인일 때 쓰는 작은 컨트롤 패널
//  - 'full': CTI 앱 안에서 고객/메모/후처리까지 다 처리하는 전체 화면
// URL `?mode=mini` 또는 localStorage 로 영속, 기본은 full.
export type WorkspaceMode = 'mini' | 'full';

const LS_KEY = 'kaster.workspace_mode';

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
  setMode: (mode: WorkspaceMode) => void;
}

export const useUiStore = create<UiState>((set) => ({
  mode: detectInitialMode(),
  setMode: (mode) => {
    try {
      localStorage.setItem(LS_KEY, mode);
    } catch {
      // noop
    }
    set({ mode });
  },
}));
