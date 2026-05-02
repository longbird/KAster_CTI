import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      post: vi.fn(),
    })),
  },
}));

import { DesktopAuthClient } from './auth-client';
import axios from 'axios';

describe('DesktopAuthClient', () => {
  const create = vi.mocked(axios.create);
  let post: ReturnType<typeof vi.fn>;
  let get: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    post = vi.fn();
    get = vi.fn();
    create.mockReset();
    create.mockReturnValue({ post, get } as never);
  });

  it('exchangeHandoff 는 handoff token 을 데스크톱 세션으로 교환한다', async () => {
    post.mockResolvedValueOnce({
      data: {
        data: {
          accessToken: 'access-1',
          refreshToken: 'refresh-1',
        },
      },
    });
    get.mockResolvedValueOnce({
      data: {
        data: {
          agent: {
            agentId: 'agent-1',
            agentName: '상담원1',
            extension: '1001',
            role: 'agent',
          },
          softphoneConfig: {
            enabled: true,
            sipUri: 'sip:1001@pbx.example.com',
            wsServer: 'wss://pbx.example.com:8089/ws',
            authorizationUsername: '1001',
            authorizationPassword: 'sip-secret-1001',
            displayName: '상담원1',
            iceServers: [],
          },
        },
      },
    });

    const client = new DesktopAuthClient('https://cti-center-a.example.com');
    const result = await client.exchangeHandoff('handoff-1');

    expect(create).toHaveBeenCalledWith({
      baseURL: 'https://cti-center-a.example.com/api/v1',
      timeout: 10000,
    });
    expect(post).toHaveBeenCalledWith('/auth/handoff/exchange', {
      handoffToken: 'handoff-1',
    });
    expect(get).toHaveBeenCalledWith('/auth/desktop/session', {
      headers: {
        Authorization: 'Bearer access-1',
      },
    });
    expect(result.agent.agentId).toBe('agent-1');
    expect(result.refreshToken).toBe('refresh-1');
    expect(result.softphoneConfig?.authorizationPassword).toBe('sip-secret-1001');
  });

  it('refreshSession 은 저장된 refresh token 으로 새 세션을 받아온다', async () => {
    post.mockResolvedValueOnce({
      data: {
        data: {
          accessToken: 'access-2',
          refreshToken: 'refresh-2',
        },
      },
    });
    get.mockResolvedValueOnce({
      data: {
        data: {
          agent: {
            agentId: 'agent-1',
            agentName: '상담원1',
            extension: '1001',
            role: 'agent',
          },
          softphoneConfig: {
            enabled: true,
            sipUri: 'sip:1001@pbx.example.com',
            wsServer: 'wss://pbx.example.com:8089/ws',
            authorizationUsername: '1001',
            authorizationPassword: 'sip-secret-1001',
            displayName: '상담원1',
            iceServers: [],
          },
        },
      },
    });

    const client = new DesktopAuthClient('https://cti-center-a.example.com');
    const result = await client.refreshSession('refresh-1');

    expect(post).toHaveBeenCalledWith('/auth/refresh', {
      refreshToken: 'refresh-1',
    });
    expect(get).toHaveBeenCalledWith('/auth/desktop/session', {
      headers: {
        Authorization: 'Bearer access-2',
      },
    });
    expect(result.accessToken).toBe('access-2');
    expect(result.refreshToken).toBe('refresh-2');
  });

  it('loginWithCredentials 는 자격 증명으로 데스크톱 세션을 시작한다', async () => {
    post.mockResolvedValueOnce({
      data: {
        data: {
          accessToken: 'access-3',
          refreshToken: 'refresh-3',
        },
      },
    });
    get.mockResolvedValueOnce({
      data: {
        data: {
          agent: {
            agentId: 'agent-3',
            agentName: '상담원3',
            extension: '2001',
            role: 'supervisor',
          },
          softphoneConfig: {
            enabled: true,
            sipUri: 'sip:2001@pbx.example.com',
            wsServer: 'wss://pbx.example.com:8089/ws',
            authorizationUsername: '2001',
            authorizationPassword: 'sip-secret-2001',
            displayName: '상담원3',
            iceServers: [],
          },
        },
      },
    });

    const client = new DesktopAuthClient('https://cti-center-a.example.com');
    const result = await client.loginWithCredentials({
      loginId: 'supervisor1',
      extension: '2001',
      password: 'Password123!',
    });

    expect(post).toHaveBeenCalledWith('/auth/login', {
      loginId: 'supervisor1',
      extension: '2001',
      password: 'Password123!',
      clientType: 'desktop',
    });
    expect(get).toHaveBeenCalledWith('/auth/desktop/session', {
      headers: {
        Authorization: 'Bearer access-3',
      },
    });
    expect(result.agent.agentId).toBe('agent-3');
    expect(result.refreshToken).toBe('refresh-3');
  });

  it('createWebHandoff 는 로그인 세션으로 웹 handoff token 을 요청한다', async () => {
    post.mockResolvedValueOnce({
      data: {
        data: {
          handoffToken: 'web-handoff-1',
          expiresIn: 60,
          redirectPath: '/desktop-handoff',
        },
      },
    });

    const client = new DesktopAuthClient('https://cti-center-a.example.com');
    const result = await client.createWebHandoff('access-4', {
      redirectPath: '/desktop-handoff',
    });

    expect(post).toHaveBeenCalledWith(
      '/auth/web-handoff',
      {
        redirectPath: '/desktop-handoff',
      },
      {
        headers: {
          Authorization: 'Bearer access-4',
        },
      },
    );
    expect(result).toEqual({
      handoffToken: 'web-handoff-1',
      expiresIn: 60,
      redirectPath: '/desktop-handoff',
    });
  });

  it('loginWithCredentials 는 로그인 요청이 실패하면 desktop session hydrate 를 시도하지 않는다', async () => {
    post.mockRejectedValueOnce(new Error('invalid credentials'));

    const client = new DesktopAuthClient('https://cti-center-a.example.com');

    await expect(client.loginWithCredentials({
      loginId: 'agent1001',
      extension: '1001',
      password: 'wrong-password',
    })).rejects.toThrow('invalid credentials');
    expect(get).not.toHaveBeenCalled();
  });

  it('loginWithCredentials 는 401 응답을 로그인 안내 메시지로 변환한다', async () => {
    post.mockRejectedValueOnce({
      response: {
        status: 401,
        data: {
          error: {
            message: 'Invalid credentials',
          },
        },
      },
    });

    const client = new DesktopAuthClient('https://cti-center-a.example.com');

    await expect(client.loginWithCredentials({
      loginId: 'agent1001',
      extension: '1001',
      password: 'wrong-password',
    })).rejects.toThrow('로그인 정보가 올바르지 않습니다');
    expect(get).not.toHaveBeenCalled();
  });
});
