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
  let get: ReturnType<typeof vi.fn>;
  let socketOn: ReturnType<typeof vi.fn>;
  let socketDisconnect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    post = vi.fn();
    get = vi.fn();
    socketOn = vi.fn();
    socketDisconnect = vi.fn();
    create.mockReset();
    ioMock.mockReset();
    create.mockReturnValue({ post, get } as never);
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

    runtime.connect({ onEvent: () => undefined });

    expect(ioMock).toHaveBeenCalledWith('https://cti-center-a.example.com/ws', {
      auth: { token: 'access-1' },
      transports: ['websocket'],
    });
    [
      'call.created',
      'call.updated',
      'call.ended',
      'screenpop.customer',
      'agent.status.changed',
      'queue.summary.updated',
    ].forEach((eventName) => {
      expect(socketOn).toHaveBeenCalledWith(eventName, expect.any(Function));
    });
  });

  it('connect 는 socket lifecycle 이벤트를 connection state callback 으로 전달한다', () => {
    const states: Array<{ state: string; reason?: string }> = [];
    const runtime = new CtiRuntime({
      baseUrl: 'https://cti-center-a.example.com',
      accessToken: 'access-1',
    });

    runtime.connect({
      onEvent: () => undefined,
      onConnectionState: (payload) => states.push(payload),
    });

    const connectHandler = socketOn.mock.calls.find((call) => call[0] === 'connect')?.[1] as (() => void) | undefined;
    const disconnectHandler = socketOn.mock.calls.find((call) => call[0] === 'disconnect')?.[1] as ((reason: string) => void) | undefined;
    const errorHandler = socketOn.mock.calls.find((call) => call[0] === 'connect_error')?.[1] as ((error: Error) => void) | undefined;
    const reconnectAttemptHandler = socketOn.mock.calls.find((call) => call[0] === 'reconnect_attempt')?.[1] as ((attempt: number) => void) | undefined;

    connectHandler?.();
    reconnectAttemptHandler?.(2);
    disconnectHandler?.('transport close');
    errorHandler?.(new Error('unauthorized'));

    expect(states).toEqual([
      { state: 'connected' },
      { state: 'reconnecting', reason: 'attempt:2' },
      { state: 'disconnected', reason: 'transport close' },
      { state: 'error', reason: 'unauthorized' },
    ]);
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

  it('hangup 은 hangup endpoint 를 호출한다', async () => {
    post.mockResolvedValueOnce({
      data: {
        data: {
          accepted: true,
          requestedAt: '2026-04-22T12:00:00.000Z',
          correlationId: 'corr-1',
        },
      },
    });

    const runtime = new CtiRuntime({
      baseUrl: 'https://cti-center-a.example.com',
      accessToken: 'access-1',
    });

    await runtime.hangup('call-1');

    expect(post).toHaveBeenCalledWith(
      '/calls/call-1/hangup',
      {},
      {
        headers: {
          'x-correlation-id': 'corr-1',
        },
      },
    );
  });

  it('pickup 과 transfer 는 각 command endpoint 를 호출한다', async () => {
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

    await runtime.pickup('call-1');
    await runtime.transfer('call-1', {
      target: '1002',
      transferType: 'blind',
      fromExtension: '1001',
    });

    expect(post).toHaveBeenNthCalledWith(
      1,
      '/calls/call-1/pickup',
      {},
      {
        headers: {
          'x-correlation-id': 'corr-1',
        },
      },
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/calls/call-1/transfer',
      {
        target: '1002',
        transferType: 'blind',
        fromExtension: '1001',
      },
      {
        headers: {
          'x-correlation-id': 'corr-1',
        },
      },
    );
  });

  it('originate 는 상담원 내선과 대상 번호로 발신 요청을 보낸다', async () => {
    post.mockResolvedValueOnce({
      data: {
        data: {
          accepted: true,
          requestedAt: '2026-04-22T12:00:00.000Z',
          correlationId: 'corr-1',
          channel: 'PJSIP/1001',
        },
      },
    });

    const runtime = new CtiRuntime({
      baseUrl: 'https://cti-center-a.example.com',
      accessToken: 'access-1',
    });

    const result = await runtime.originate({
      agentExtension: '1001',
      phoneNumber: '01012345678',
    });

    expect(post).toHaveBeenCalledWith(
      '/calls/originate',
      {
        agentExtension: '1001',
        phoneNumber: '01012345678',
      },
      {
        headers: {
          'x-correlation-id': 'corr-1',
        },
      },
    );
    expect(result.channel).toBe('PJSIP/1001');
  });

  it('originateInternal 은 내선 발신 endpoint 를 호출한다', async () => {
    post.mockResolvedValueOnce({
      data: {
        data: {
          accepted: true,
          requestedAt: '2026-04-22T12:00:00.000Z',
          correlationId: 'corr-1',
        },
      },
    });

    const runtime = new CtiRuntime({
      baseUrl: 'https://cti-center-a.example.com',
      accessToken: 'access-1',
    });

    await runtime.originateInternal({
      targetAgentId: 'agent-2',
      targetExtension: '1002',
    });

    expect(post).toHaveBeenCalledWith(
      '/calls/originate/internal',
      {
        targetAgentId: 'agent-2',
        targetExtension: '1002',
      },
      {
        headers: {
          'x-correlation-id': 'corr-1',
        },
      },
    );
  });

  it('getCallerIds 는 me session 의 등록 발신번호를 반환한다', async () => {
    get.mockResolvedValueOnce({
      data: {
        data: {
          outboundDialOptions: {
            allowedCallerIds: ['15777893', '07052346380'],
            defaultCallerId: '07052346380',
          },
        },
      },
    });

    const runtime = new CtiRuntime({
      baseUrl: 'https://cti-center-a.example.com',
      accessToken: 'access-1',
    });

    await expect(runtime.getCallerIds()).resolves.toEqual({
      callerIds: ['15777893', '07052346380'],
      defaultCallerId: '07052346380',
    });
    expect(get).toHaveBeenCalledWith('/me/session');
  });

  it('getAgentDirectory 는 상담원 목록을 데스크톱 타입으로 정규화한다', async () => {
    get.mockResolvedValueOnce({
      data: {
        data: [
          {
            agentId: 'agent-2',
            agentName: 'Agent Two',
            extension: '1002',
            role: 'agent',
            isActive: true,
            currentStatus: { statusCode: 'AVAILABLE' },
          },
        ],
      },
    });

    const runtime = new CtiRuntime({
      baseUrl: 'https://cti-center-a.example.com',
      accessToken: 'access-1',
    });

    await expect(runtime.getAgentDirectory()).resolves.toEqual([
      {
        agentId: 'agent-2',
        agentName: 'Agent Two',
        extension: '1002',
        role: 'agent',
        isActive: true,
        loginStatus: 'UNKNOWN',
        sipRegistration: {
          registered: false,
          registrationStatus: 'UNKNOWN',
          contactUri: null,
          userAgent: null,
          roundtripUsec: null,
        },
        canCall: false,
        currentStatus: { statusCode: 'AVAILABLE' },
      },
    ]);
    expect(get).toHaveBeenCalledWith('/agents');
  });

  it('getCallHistory 는 통화내역을 데스크톱 타입으로 정규화한다', async () => {
    get.mockResolvedValueOnce({
      data: {
        data: [
          {
            callId: 'call-1',
            ani: '01012345678',
            dnis: '15777893',
            queueName: '대표',
            sessionStatus: 'ENDED',
            direction: 'INBOUND',
            startedAt: '2026-05-02T12:00:00.000Z',
            answeredAt: '2026-05-02T12:00:05.000Z',
            endedAt: '2026-05-02T12:03:00.000Z',
            talkSeconds: 175,
            primaryAgent: { agentName: '상담원1' },
            customer: { customerName: '홍길동' },
          },
        ],
      },
    });

    const runtime = new CtiRuntime({
      baseUrl: 'https://cti-center-a.example.com',
      accessToken: 'access-1',
    });

    await expect(runtime.getCallHistory()).resolves.toEqual([
      expect.objectContaining({
        callId: 'call-1',
        ani: '01012345678',
        sessionStatus: 'ENDED',
        talkSeconds: 175,
        primaryAgent: { agentName: '상담원1' },
        customer: { customerName: '홍길동' },
      }),
    ]);
    expect(get).toHaveBeenCalledWith('/calls/history');
  });

  it('상담 전환 취소와 완료 endpoint 를 호출한다', async () => {
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

    await runtime.cancelAttendedTransfer('call-1');
    await runtime.completeAttendedTransfer('call-1');

    expect(post).toHaveBeenNthCalledWith(
      1,
      '/calls/call-1/transfer/attended/cancel',
      {},
      {
        headers: {
          'x-correlation-id': 'corr-1',
        },
      },
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/calls/call-1/transfer/attended/complete',
      {},
      {
        headers: {
          'x-correlation-id': 'corr-1',
        },
      },
    );
  });
});
