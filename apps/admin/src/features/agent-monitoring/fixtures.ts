import type { ActiveCallRow, AgentMonitorRow } from './types';

interface RawAgentRow {
  agentId: string;
  agentName: string;
  loginId: string;
  extension: string;
  role: string;
  isActive?: boolean;
  agentGroup?: {
    agentGroupId: string;
    groupCode: string;
    groupName: string;
  } | null;
  loginStatus?: 'LOGGED_IN' | 'LOGGED_OUT' | 'UNKNOWN';
  sipRegistration?: {
    registered?: boolean;
    registrationStatus?: string;
    contactUri?: string | null;
  } | null;
  currentStatus?: {
    statusCode: string;
    reasonCode?: string | null;
    startedAt: string;
  } | null;
}

export function joinAgentsAndCalls(
  agents: ReadonlyArray<RawAgentRow>,
  activeCalls: ReadonlyArray<ActiveCallRow>,
): AgentMonitorRow[] {
  const callsByAgentId = new Map<string, ActiveCallRow>();
  for (const call of activeCalls) {
    if (call.primaryAgentId) {
      // 최초 매칭 우선 — 동일 agent 가 동시에 여러 통화에 묶일 일은 없으나, 백엔드 정렬 의존하지 않도록.
      if (!callsByAgentId.has(call.primaryAgentId)) {
        callsByAgentId.set(call.primaryAgentId, call);
      }
    }
  }

  return agents.map((agent) => ({
    agentId: agent.agentId,
    agentName: agent.agentName,
    loginId: agent.loginId,
    extension: agent.extension,
    role: agent.role,
    isActive: agent.isActive !== false,
    agentGroup: agent.agentGroup ?? null,
    loginStatus: agent.loginStatus ?? 'UNKNOWN',
    sipRegistration: {
      registered: agent.sipRegistration?.registered === true,
      registrationStatus: agent.sipRegistration?.registrationStatus ?? 'UNREGISTERED',
      contactUri: agent.sipRegistration?.contactUri ?? null,
    },
    currentStatus: agent.currentStatus
      ? {
          statusCode: agent.currentStatus.statusCode,
          reasonCode: agent.currentStatus.reasonCode ?? null,
          startedAt: agent.currentStatus.startedAt,
        }
      : null,
    activeCall: callsByAgentId.get(agent.agentId)
      ? {
          callId: callsByAgentId.get(agent.agentId)!.callId,
          sessionStatus: callsByAgentId.get(agent.agentId)!.sessionStatus,
          direction: callsByAgentId.get(agent.agentId)!.direction ?? null,
          ani: callsByAgentId.get(agent.agentId)!.ani ?? null,
          dnis: callsByAgentId.get(agent.agentId)!.dnis ?? null,
          queueName: callsByAgentId.get(agent.agentId)!.queueName ?? null,
          answeredAt: callsByAgentId.get(agent.agentId)!.answeredAt ?? null,
          talkSeconds: callsByAgentId.get(agent.agentId)!.talkSeconds ?? null,
        }
      : null,
  }));
}

export function summarizeMonitorRows(rows: ReadonlyArray<AgentMonitorRow>): {
  total: number;
  online: number;
  available: number;
  talking: number;
  afterCall: number;
  rest: number;
  offline: number;
} {
  let online = 0;
  let available = 0;
  let talking = 0;
  let afterCall = 0;
  let rest = 0;
  let offline = 0;

  for (const row of rows) {
    if (row.loginStatus === 'LOGGED_IN') {
      online += 1;
    } else {
      offline += 1;
    }

    const status = row.currentStatus?.statusCode;
    if (!status) continue;
    if (status === 'AVAILABLE') {
      available += 1;
    } else if (status === 'TALKING' || row.activeCall?.sessionStatus === 'TALKING') {
      talking += 1;
    } else if (status === 'AFTER_CALL_WORK') {
      afterCall += 1;
    } else if (status === 'BREAK' || status === 'MEAL' || status === 'TRAINING' || status === 'MANUAL_PAUSED') {
      rest += 1;
    }
  }

  return {
    total: rows.length,
    online,
    available,
    talking,
    afterCall,
    rest,
    offline,
  };
}
