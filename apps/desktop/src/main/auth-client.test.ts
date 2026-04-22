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

  beforeEach(() => {
    post = vi.fn();
    create.mockReset();
    create.mockReturnValue({ post } as never);
  });

  it('exchangeHandoff 는 handoff token 을 데스크톱 세션으로 교환한다', async () => {
    post.mockResolvedValueOnce({
      data: {
        data: {
          accessToken: 'access-1',
          refreshToken: 'refresh-1',
          agent: {
            agentId: 'agent-1',
            agentName: '상담원1',
            extension: '1001',
            role: 'agent',
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
    expect(result.agent.agentId).toBe('agent-1');
    expect(result.refreshToken).toBe('refresh-1');
  });

  it('refreshSession 은 저장된 refresh token 으로 새 세션을 받아온다', async () => {
    post.mockResolvedValueOnce({
      data: {
        data: {
          accessToken: 'access-2',
          refreshToken: 'refresh-2',
          agent: {
            agentId: 'agent-1',
            agentName: '상담원1',
            extension: '1001',
            role: 'agent',
          },
        },
      },
    });

    const client = new DesktopAuthClient('https://cti-center-a.example.com');
    const result = await client.refreshSession('refresh-1');

    expect(post).toHaveBeenCalledWith('/auth/refresh', {
      refreshToken: 'refresh-1',
    });
    expect(result.accessToken).toBe('access-2');
    expect(result.refreshToken).toBe('refresh-2');
  });
});
