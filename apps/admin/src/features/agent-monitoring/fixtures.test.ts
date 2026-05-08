import { describe, expect, it } from 'vitest';
import { joinAgentsAndCalls, summarizeMonitorRows } from './fixtures';
import type { ActiveCallRow } from './types';

const A1 = {
  agentId: 'a1',
  agentName: 'Agent One',
  loginId: 'agent1',
  extension: '1001',
  role: 'agent',
  isActive: true,
  loginStatus: 'LOGGED_IN' as const,
  agentGroup: { agentGroupId: 'g1', groupCode: 'A', groupName: '1팀' },
  sipRegistration: { registered: true, registrationStatus: 'Reachable' },
  currentStatus: { statusCode: 'TALKING', startedAt: '2026-05-08T03:00:00Z' },
};

const A2 = {
  agentId: 'a2',
  agentName: 'Agent Two',
  loginId: 'agent2',
  extension: '1002',
  role: 'agent',
  isActive: true,
  loginStatus: 'LOGGED_IN' as const,
  agentGroup: null,
  sipRegistration: { registered: true, registrationStatus: 'Reachable' },
  currentStatus: { statusCode: 'AVAILABLE', startedAt: '2026-05-08T03:01:00Z' },
};

const A3 = {
  agentId: 'a3',
  agentName: 'Agent Three',
  loginId: 'agent3',
  extension: '1003',
  role: 'agent',
  isActive: true,
  loginStatus: 'LOGGED_OUT' as const,
  agentGroup: { agentGroupId: 'g1', groupCode: 'A', groupName: '1팀' },
  sipRegistration: { registered: false, registrationStatus: 'UNREGISTERED' },
  currentStatus: null,
};

const CALL_FOR_A1: ActiveCallRow = {
  callId: 'c1',
  sessionStatus: 'TALKING',
  direction: 'INBOUND',
  ani: '01099991111',
  dnis: '15777893',
  queueName: '대표',
  answeredAt: '2026-05-08T03:00:05Z',
  talkSeconds: null,
  primaryAgentId: 'a1',
};

describe('joinAgentsAndCalls', () => {
  it('attaches active calls to the matching agent and leaves others empty', () => {
    const result = joinAgentsAndCalls([A1, A2, A3], [CALL_FOR_A1]);
    expect(result.find((row) => row.agentId === 'a1')?.activeCall?.callId).toBe('c1');
    expect(result.find((row) => row.agentId === 'a2')?.activeCall).toBeNull();
    expect(result.find((row) => row.agentId === 'a3')?.activeCall).toBeNull();
  });

  it('preserves group, login, and sip registration fields', () => {
    const result = joinAgentsAndCalls([A1, A2, A3], []);
    expect(result[0].agentGroup?.groupName).toBe('1팀');
    expect(result[1].agentGroup).toBeNull();
    expect(result[2].sipRegistration.registered).toBe(false);
    expect(result[2].loginStatus).toBe('LOGGED_OUT');
  });

  it('only matches the first call to an agent (defensive against duplicates)', () => {
    const dup: ActiveCallRow = { ...CALL_FOR_A1, callId: 'c1-dup' };
    const result = joinAgentsAndCalls([A1], [CALL_FOR_A1, dup]);
    expect(result[0].activeCall?.callId).toBe('c1');
  });
});

describe('summarizeMonitorRows', () => {
  it('counts online vs offline and bucketizes by status', () => {
    const result = joinAgentsAndCalls([A1, A2, A3], [CALL_FOR_A1]);
    const summary = summarizeMonitorRows(result);
    expect(summary.total).toBe(3);
    expect(summary.online).toBe(2); // a1, a2
    expect(summary.offline).toBe(1); // a3
    expect(summary.talking).toBe(1); // a1
    expect(summary.available).toBe(1); // a2
  });
});
