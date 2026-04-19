import dayjs from 'dayjs';
import { initialActiveCalls, initialAgentDirectory, initialAgentSession, initialQueues, recentHistory } from '../mock/data';
import type { ActiveCall, AgentDirectoryItem, AgentSession, ApiResponse, CallHistoryItem, QueueSummary } from '../types/cti';

const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

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

export async function transferCall(callId: string, target: string, _mode: 'blind' | 'attended' = 'blind'): Promise<ApiResponse<{ callId: string; target: string; requestedAt: string }>> {
  await wait();
  return {
    success: true,
    data: { callId, target, requestedAt: dayjs().toISOString() },
    error: null,
  };
}

export async function cancelAttendedTransferCall(callId: string): Promise<ApiResponse<{ callId: string; canceled: boolean; requestedAt: string }>> {
  await wait();
  return {
    success: true,
    data: { callId, canceled: true, requestedAt: dayjs().toISOString() },
    error: null,
  };
}

export async function completeAttendedTransferCall(callId: string): Promise<ApiResponse<{ callId: string; accepted: boolean; requestedAt: string }>> {
  await wait();
  return {
    success: true,
    data: { callId, accepted: true, requestedAt: dayjs().toISOString() },
    error: null,
  };
}

export async function pickupCall(callId: string): Promise<ApiResponse<{ callId: string; accepted: boolean; extension: string; requestedAt: string }>> {
  await wait();
  return {
    success: true,
    data: { callId, accepted: true, extension: '1001', requestedAt: dayjs().toISOString() },
    error: null,
  };
}

export async function muteCall(callId: string, state: 'on' | 'off'): Promise<ApiResponse<{ callId: string; accepted: boolean; state: 'on' | 'off'; direction: string }>> {
  await wait();
  return {
    success: true,
    data: { callId, accepted: true, state, direction: 'all' },
    error: null,
  };
}

export async function holdCall(callId: string, action: 'hold' | 'resume'): Promise<ApiResponse<{ callId: string; accepted: boolean; action: 'hold' | 'resume' }>> {
  await wait();
  return {
    success: true,
    data: { callId, accepted: true, action },
    error: null,
  };
}

export async function hangupCall(callId: string): Promise<ApiResponse<{ callId: string; endedAt: string }>> {
  await wait();
  return {
    success: true,
    data: { callId, endedAt: dayjs().toISOString() },
    error: null,
  };
}

export async function originateExternalCall(
  phoneNumber: string,
  callerId?: string,
): Promise<ApiResponse<{ accepted: boolean; channel: string; requestedAt: string; phoneNumber: string; callerId?: string }>> {
  await wait();
  return {
    success: true,
    data: {
      accepted: true,
      channel: 'PJSIP/1001',
      requestedAt: dayjs().toISOString(),
      phoneNumber,
      callerId,
    },
    error: null,
  };
}

export async function originateInternalCall(
  targetAgentId: string,
  targetExtension: string,
): Promise<ApiResponse<{ accepted: boolean; channel: string; requestedAt: string; targetAgentId: string; targetExtension: string }>> {
  await wait();
  return {
    success: true,
    data: {
      accepted: true,
      channel: 'PJSIP/1001',
      requestedAt: dayjs().toISOString(),
      targetAgentId,
      targetExtension,
    },
    error: null,
  };
}
