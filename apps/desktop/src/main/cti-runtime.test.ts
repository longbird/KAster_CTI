import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      post: vi.fn(),
    })),
  },
}));

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

vi.mock('node:crypto', () => ({
  randomUUID: () => 'corr-1',
}));

import { CtiRuntime } from './cti-runtime';
import axios from 'axios';
import { io } from 'socket.io-client';

describe('CtiRuntime', () => {
  const create = vi.mocked(axios.create);
  const ioMock = vi.mocked(io);
  let post: ReturnType<typeof vi.fn>;
  let socketOn: ReturnType<typeof vi.fn>;
  let socketDisconnect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    post = vi.fn();
    socketOn = vi.fn();
    socketDisconnect = vi.fn();
    create.mockReset();
    ioMock.mockReset();
    create.mockReturnValue({ post } as never);
    ioMock.mockReturnValue({
      on: socketOn,
      disconnect: socketDisconnect,
    } as never);
  });

  it('connect 는 websocket namespace 와 이벤트 구독을 등록한다', () => {
    const runtime = new CtiRuntime({
      baseUrl: 'https://cti-center-a.example.com',
      accessToken: 'access-1',
    });

    runtime.connect(() => undefined);

    expect(ioMock).toHaveBeenCalledWith('https://cti-center-a.example.com/ws', {
      auth: { token: 'access-1' },
      transports: ['websocket'],
    });
    expect(socketOn).toHaveBeenCalledWith('call.created', expect.any(Function));
    expect(socketOn).toHaveBeenCalledWith('call.updated', expect.any(Function));
    expect(socketOn).toHaveBeenCalledWith('call.ended', expect.any(Function));
  });

  it('mute 는 correlation id 를 포함해 calls mute endpoint 를 호출한다', async () => {
    post.mockResolvedValueOnce({
      data: {
        data: {
          accepted: true,
          requestedAt: '2026-04-22T12:00:00.000Z',
          correlationId: 'corr-1',
          callId: 'call-1',
          state: 'on',
          direction: 'all',
        },
      },
    });

    const runtime = new CtiRuntime({
      baseUrl: 'https://cti-center-a.example.com',
      accessToken: 'access-1',
    });
    const result = await runtime.mute('call-1', 'on');

    expect(create).toHaveBeenCalledWith({
      baseURL: 'https://cti-center-a.example.com/api/v1',
      timeout: 10000,
      headers: {
        Authorization: 'Bearer access-1',
      },
    });
    expect(post).toHaveBeenCalledWith(
      '/calls/call-1/mute',
      { state: 'on', direction: 'all' },
      {
        headers: {
          'x-correlation-id': 'corr-1',
        },
      },
    );
    expect(result.callId).toBe('call-1');
  });

  it('hold 는 hold endpoint 를 호출하고 resume 은 resume endpoint 를 호출한다', async () => {
    post
      .mockResolvedValueOnce({
        data: {
          data: {
            accepted: true,
            requestedAt: '2026-04-22T12:00:00.000Z',
            correlationId: 'corr-1',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            accepted: true,
            requestedAt: '2026-04-22T12:00:01.000Z',
            correlationId: 'corr-1',
          },
        },
      });

    const runtime = new CtiRuntime({
      baseUrl: 'https://cti-center-a.example.com',
      accessToken: 'access-1',
    });

    await runtime.hold('call-1');
    await runtime.resume('call-1');

    expect(post).toHaveBeenNthCalledWith(
      1,
      '/calls/call-1/hold',
      {},
      {
        headers: {
          'x-correlation-id': 'corr-1',
        },
      },
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/calls/call-1/resume',
      {},
      {
        headers: {
          'x-correlation-id': 'corr-1',
        },
      },
    );
  });
});
