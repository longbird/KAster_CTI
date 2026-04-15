import { create } from 'zustand';

// 브라우저 localStorage 에 토큰을 유지해 새로고침 후에도 로그인이 이어지게 한다.
// XSS 위험 때문에 운영에서는 httpOnly cookie 쪽이 안전하지만, 순수 SPA 기준으로는
// 토큰을 JS 에서 읽어야 axios 헤더와 WS handshake 에 넣을 수 있어 여기서는 localStorage 선택.

const LS_ACCESS = 'kaster.access_token';
const LS_REFRESH = 'kaster.refresh_token';
const LS_AGENT = 'kaster.agent';

interface AgentInfo {
  agentId: string;
  agentName: string;
  extension: string;
  role: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  agent: AgentInfo | null;
  isAuthenticated: boolean;
  setTokens: (params: { accessToken: string; refreshToken: string; agent: AgentInfo }) => void;
  clear: () => void;
}

function readPersisted() {
  try {
    return {
      accessToken: localStorage.getItem(LS_ACCESS),
      refreshToken: localStorage.getItem(LS_REFRESH),
      agent: JSON.parse(localStorage.getItem(LS_AGENT) || 'null'),
    };
  } catch {
    return { accessToken: null, refreshToken: null, agent: null };
  }
}

export const useAuthStore = create<AuthState>((set) => {
  const persisted = readPersisted();
  return {
    accessToken: persisted.accessToken,
    refreshToken: persisted.refreshToken,
    agent: persisted.agent,
    isAuthenticated: !!persisted.accessToken,
    setTokens: ({ accessToken, refreshToken, agent }) => {
      localStorage.setItem(LS_ACCESS, accessToken);
      localStorage.setItem(LS_REFRESH, refreshToken);
      localStorage.setItem(LS_AGENT, JSON.stringify(agent));
      set({ accessToken, refreshToken, agent, isAuthenticated: true });
    },
    clear: () => {
      localStorage.removeItem(LS_ACCESS);
      localStorage.removeItem(LS_REFRESH);
      localStorage.removeItem(LS_AGENT);
      set({ accessToken: null, refreshToken: null, agent: null, isAuthenticated: false });
    },
  };
});

// 헤더 첨부용 non-hook 접근자. axios interceptor 안에서 사용.
export function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}
