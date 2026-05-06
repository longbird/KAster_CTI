import dayjs from 'dayjs';
import { initialActiveCalls, initialAgentDirectory, initialAgentSession, initialAnnouncements, initialQueues, recentHistory } from '../mock/data';
import type { ActiveCall, AgentDirectoryItem, AgentSession, Announcement, ApiResponse, CallHistoryItem, CommandAck, QueueSummary } from '../types/cti';

const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

function mockCommandAck(): CommandAck {
  return {
    accepted: true,
    requestedAt: dayjs().toISOString(),
    correlationId: `mock-${Math.random().toString(36).slice(2, 10)}`,
    idempotencyKey: null,
  };
}

export async function getAgentSession(): Promise<ApiResponse<AgentSession>> {
  await wait();
  return { success: true, data: initialAgentSession, error: null };
}

export async function getQueuesSummary(): Promise<ApiResponse<QueueSummary[]>> {
  await wait();
  return { success: true, data: initialQueues, error: null };
}

export async function getActiveCalls(): Promise<ApiResponse<ActiveCall[]>> {
  await wait();
  return { success: true, data: initialActiveCalls, error: null };
}

export async function getCallHistory(): Promise<ApiResponse<CallHistoryItem[]>> {
  await wait();
  return { success: true, data: recentHistory, error: null };
}

export async function getAgents(): Promise<ApiResponse<AgentDirectoryItem[]>> {
  await wait();
  return { success: true, data: initialAgentDirectory, error: null };
}

export async function getAnnouncements(): Promise<ApiResponse<Announcement[]>> {
  await wait();
  return { success: true, data: initialAnnouncements, error: null };
}

export async function updateAgentStatus(statusCode: AgentSession['statusCode']): Promise<ApiResponse<{ statusCode: AgentSession['statusCode'] }>> {
  await wait();
  return { success: true, data: { statusCode }, error: null };
}

export async function saveCallMemo(callId: string, memo: string, resultCode: string): Promise<ApiResponse<{ callId: string; memo: string; resultCode: string }>> {
  await wait();
  return {
    success: true,
    data: { callId, memo, resultCode },
    error: null,
  };
}

export async function transferCall(callId: string, target: string, _mode: 'blind' | 'attended' = 'blind'): Promise<ApiResponse<CommandAck & { callId: string; target: string }>> {
  await wait();
  return {
    success: true,
    data: { ...mockCommandAck(), callId, target },
    error: null,
  };
}

export async function cancelAttendedTransferCall(callId: string): Promise<ApiResponse<CommandAck & { callId: string; canceled: boolean }>> {
  await wait();
  return {
    success: true,
    data: { ...mockCommandAck(), callId, canceled: true },
    error: null,
  };
}

export async function completeAttendedTransferCall(callId: string): Promise<ApiResponse<CommandAck & { callId: string }>> {
  await wait();
  return {
    success: true,
    data: { ...mockCommandAck(), callId },
    error: null,
  };
}

export async function pickupCall(callId: string): Promise<ApiResponse<CommandAck & { callId: string; extension: string }>> {
  await wait();
  return {
    success: true,
    data: { ...mockCommandAck(), callId, extension: '1001' },
    error: null,
  };
}

export async function muteCall(callId: string, state: 'on' | 'off'): Promise<ApiResponse<CommandAck & { callId: string; state: 'on' | 'off'; direction: string }>> {
  await wait();
  return {
    success: true,
    data: { ...mockCommandAck(), callId, state, direction: 'all' },
    error: null,
  };
}

export async function holdCall(callId: string, action: 'hold' | 'resume'): Promise<ApiResponse<CommandAck & { callId: string; action: 'hold' | 'resume' }>> {
  await wait();
  return {
    success: true,
    data: { ...mockCommandAck(), callId, action },
    error: null,
  };
}

export async function hangupCall(callId: string): Promise<ApiResponse<CommandAck & { callId: string; endedAt: string }>> {
  await wait();
  return {
    success: true,
    data: { ...mockCommandAck(), callId, endedAt: dayjs().toISOString() },
    error: null,
  };
}

export async function originateExternalCall(
  phoneNumber: string,
  callerId?: string,
): Promise<ApiResponse<CommandAck & { channel: string; phoneNumber: string; callerId?: string }>> {
  await wait();
  return {
    success: true,
    data: {
      ...mockCommandAck(),
      channel: 'PJSIP/1001',
      phoneNumber,
      callerId,
    },
    error: null,
  };
}

export async function originateInternalCall(
  targetAgentId: string,
  targetExtension: string,
): Promise<ApiResponse<CommandAck & { channel: string; targetAgentId: string; targetExtension: string }>> {
  await wait();
  return {
    success: true,
    data: {
      ...mockCommandAck(),
      channel: 'PJSIP/1001',
      targetAgentId,
      targetExtension,
    },
    error: null,
  };
}
