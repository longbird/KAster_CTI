import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCtiStore } from './useCtiStore';

vi.mock('../api', () => ({
  getAgentSession: vi.fn().mockResolvedValue({
    data: {
      agentId: 'agent-1',
      agentName: '상담원1',
      extension: '1001',
      statusCode: 'AVAILABLE',
      todayAnswered: 0,
      todayMissed: 0,
      todayTalkSeconds: 0,
    },
  }),
  getQueuesSummary: vi.fn().mockResolvedValue({ data: [] }),
  getActiveCalls: vi.fn().mockResolvedValue({ data: [] }),
  getCallHistory: vi.fn().mockResolvedValue({ data: [] }),
  getAgents: vi.fn().mockResolvedValue({ data: [] }),
  muteCall: vi.fn().mockResolvedValue({
    data: {
      callId: 'call-1',
      accepted: true,
      state: 'on',
      direction: 'all',
      correlationId: 'corr-mute-1',
      requestedAt: '2026-04-22T12:00:00.000Z',
    },
  }),
  hangupCall: vi.fn().mockResolvedValue({
    data: {
      callId: 'call-1',
      accepted: true,
      correlationId: 'corr-hangup-1',
      requestedAt: '2026-04-22T12:00:01.000Z',
    },
  }),
}));

vi.mock('../ws', () => ({
  connectSocket: vi.fn(() => () => undefined),
}));

describe('useCtiStore command metadata', () => {
  beforeEach(() => {
    useCtiStore.setState({
      loading: false,
      agentSession: {
        agentId: 'agent-1',
        agentName: '상담원1',
        extension: '1001',
        statusCode: 'AVAILABLE',
        todayAnswered: 0,
        todayMissed: 0,
        todayTalkSeconds: 0,
      },
      queues: [],
      agentDirectory: [],
      activeCalls: [
        {
          callId: 'call-1',
          linkedid: 'L-1',
          ani: '01012345678',
          dnis: '15771577',
          queueName: '대표',
          sessionStatus: 'TALKING',
          startedAt: '2026-04-22T11:59:00.000Z',
          isMuted: false,
        },
      ],
      selectedCallId: 'call-1',
      recentHistory: [],
      notifications: [],
      eventLog: [],
    });
  });

  it('toggleMute 는 correlationId 가 포함된 로그를 남긴다', async () => {
    await useCtiStore.getState().toggleMute();

    const state = useCtiStore.getState();
    expect(state.activeCalls[0].isMuted).toBe(true);
    expect(state.eventLog[0].message).toContain('corr-mute-1');
  });

  it('toggleMute 는 서버 ack 의 requestedAt 도 로그 메시지에 남긴다', async () => {
    await useCtiStore.getState().toggleMute();

    expect(useCtiStore.getState().eventLog[0].message).toContain('2026-04-22T12:00:00.000Z');
  });

  it('agent.status.changed 는 현재 상담원 이벤트만 자기 상태로 반영한다', () => {
    useCtiStore.getState().applyEvent({
      type: 'agent.status.changed',
      payload: {
        agentId: 'agent-2',
        statusCode: 'BREAK',
      },
    });

    expect(useCtiStore.getState().agentSession?.statusCode).toBe('AVAILABLE');

    useCtiStore.getState().applyEvent({
      type: 'agent.status.changed',
      payload: {
        agentId: 'agent-1',
        statusCode: 'BREAK',
      },
    });

    expect(useCtiStore.getState().agentSession?.statusCode).toBe('BREAK');
  });

  it('hangup 은 요청 접수 후 서버 종료 이벤트 전까지 통화 상태를 확정하지 않는다', async () => {
    await useCtiStore.getState().hangup();

    const state = useCtiStore.getState();
    expect(state.activeCalls[0].sessionStatus).toBe('TALKING');
    expect(state.eventLog[0].type).toBe('info');
    expect(state.eventLog[0].message).toContain('corr-hangup-1');
  });
});
