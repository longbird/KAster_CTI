import dayjs from 'dayjs';
import { initialActiveCalls, initialAgentSession, initialQueues, recentHistory } from '../mock/data';
import type { ActiveCall, AgentSession, ApiResponse, CallHistoryItem, QueueSummary } from '../types/cti';

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

export async function transferCall(callId: string, target: string): Promise<ApiResponse<{ callId: string; target: string; requestedAt: string }>> {
  await wait();
  return {
    success: true,
    data: { callId, target, requestedAt: dayjs().toISOString() },
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
