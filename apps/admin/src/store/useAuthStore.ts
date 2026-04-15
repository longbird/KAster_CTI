import { create } from 'zustand';
import { ACCESS_TOKEN_KEY } from '../config';

// apps/web 과 동일한 localStorage 키(기본 kaster.access_token) 를 공유할 수
// 있게 해뒀지만, admin 전용 계정을 쓰고 싶으면 VITE_ACCESS_TOKEN_KEY 로 분리.
const LS_REFRESH = 'kaster.refresh_token';
const LS_AGENT = 'kaster.agent';

const SUPERVISORY_ROLES = new Set(['supervisor', 'admin']);

export interface AgentInfo {
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
  isSupervisor: boolean;
  setTokens: (params: { accessToken: string; refreshToken: string; agent: AgentInfo }) => void;
  clear: () => void;
}

function readPersisted() {
  try {
    const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    const refreshToken = localStorage.getItem(LS_REFRESH);
    const agentRaw = localStorage.getItem(LS_AGENT);
    const agent = agentRaw ? (JSON.parse(agentRaw) as AgentInfo) : null;
    return { accessToken, refreshToken, agent };
  } catch {
    return { accessToken: null, refreshToken: null, agent: null };
  }
}

function isSupervisor(agent: AgentInfo | null): boolean {
  return !!agent && SUPERVISORY_ROLES.has(agent.role);
}

export const useAuthStore = create<AuthState>((set) => {
  const persisted = readPersisted();
  return {
    accessToken: persisted.accessToken,
    refreshToken: persisted.refreshToken,
    agent: persisted.agent,
    isAuthenticated: !!persisted.accessToken,
    isSupervisor: isSupervisor(persisted.agent),
    setTokens: ({ accessToken, refreshToken, agent }) => {
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(LS_REFRESH, refreshToken);
      localStorage.setItem(LS_AGENT, JSON.stringify(agent));
      set({
        accessToken,
        refreshToken,
        agent,
        isAuthenticated: true,
        isSupervisor: isSupervisor(agent),
      });
    },
    clear: () => {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(LS_REFRESH);
      localStorage.removeItem(LS_AGENT);
      set({
        accessToken: null,
        refreshToken: null,
        agent: null,
        isAuthenticated: false,
        isSupervisor: false,
      });
    },
  };
});

export function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}
