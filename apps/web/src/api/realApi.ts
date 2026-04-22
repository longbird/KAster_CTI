import { apiClient } from './apiClient';
import { useAuthStore } from '../store/useAuthStore';
import type {
  ActiveCall,
  AgentDirectoryItem,
  AgentSession,
  AgentStatusCode,
  ApiResponse,
  CallHistoryItem,
  CommandAck,
  QueueSummary,
} from '../types/cti';

// 백엔드 응답을 프론트 타입으로 어댑트하는 얇은 레이어.
// 백엔드 DTO 형태가 변하면 여기만 고치면 된다.

function requireCommandAck(data: unknown): CommandAck {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid command ack response');
  }

  const ack = data as Partial<CommandAck>;
  if (ack.accepted !== true || typeof ack.correlationId !== 'string' || typeof ack.requestedAt !== 'string') {
    throw new Error('Invalid command ack response');
  }

  return {
    accepted: true,
    correlationId: ack.correlationId,
    requestedAt: ack.requestedAt,
    idempotencyKey: typeof ack.idempotencyKey === 'string' || ack.idempotencyKey === null
      ? ack.idempotencyKey
      : null,
  };
}

export async function login(params: { loginId: string; password: string; extension: string }) {
  const res = await apiClient.post('/auth/login', params);
  const data = res.data?.data;
  if (!data?.accessToken) {
    throw new Error('Invalid login response');
  }
  useAuthStore.getState().setTokens({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    agent: data.agent,
  });
  return data;
}

export async function logout() {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (refreshToken) {
    try {
      await apiClient.post('/auth/logout', { refreshToken });
    } catch {
      // 멱등. 실패해도 로컬 상태는 정리.
    }
  }
  useAuthStore.getState().clear();
}

export async function getAgentSession(): Promise<ApiResponse<AgentSession>> {
  const res = await apiClient.get('/me/session');
  const agent = res.data?.data?.agent;
  const capabilities = res.data?.data?.callControlCapabilities;
  const outboundDialOptions = res.data?.data?.outboundDialOptions;
  // 현재 백엔드는 오늘 통계를 /agents/:id 에 노출. 기본값은 0 으로 채운다.
  const session: AgentSession = {
    agentId: agent?.agentId ?? '',
    agentName: agent?.agentName ?? '',
    extension: agent?.extension ?? '',
    statusCode: (agent?.currentStatus?.statusCode as AgentStatusCode) ?? 'AVAILABLE',
    todayAnswered: 0,
    todayMissed: 0,
    todayTalkSeconds: 0,
    callControlCapabilities: {
      muteEnabled: capabilities?.muteEnabled !== false,
      holdEnabled: capabilities?.holdEnabled === true,
      holdMode: capabilities?.holdMode === 'feature_code' ? 'feature_code' : 'disabled',
    },
    outboundDialOptions: {
      allowedCallerIds: Array.isArray(outboundDialOptions?.allowedCallerIds)
        ? outboundDialOptions.allowedCallerIds
        : [],
      defaultCallerId: outboundDialOptions?.defaultCallerId ?? null,
    },
  };

  // 오늘 통계 보강 — agents/:id
  try {
    const detail = await apiClient.get(`/agents/${session.agentId}`);
    const stats = detail.data?.data?.todayStats;
    if (stats) {
      session.todayAnswered = stats.answered ?? 0;
      session.todayMissed = stats.missed ?? 0;
      session.todayTalkSeconds = stats.totalTalkSeconds ?? 0;
    }
  } catch {
    // 오늘 통계 실패해도 기본 0 으로 진행
  }

  return { success: true, data: session, error: null };
}

export async function getQueuesSummary(): Promise<ApiResponse<QueueSummary[]>> {
  const res = await apiClient.get('/queues/summary');
  const raw: any[] = res.data?.data?.queues ?? [];
  const data: QueueSummary[] = raw.map((q) => ({
    queueId: q.queueId,
    queueName: q.queueDisplayName ?? q.queueName,
    waitingCount: q.waiting ?? 0,
    talkingCount: q.talking ?? 0,
    availableAgents: q.available ?? 0,
    longestWaitSeconds: q.longestWaitSeconds ?? 0,
  }));
  return { success: true, data, error: null };
}

export async function getActiveCalls(): Promise<ApiResponse<ActiveCall[]>> {
  const res = await apiClient.get('/calls/active');
  const raw: any[] = res.data?.data ?? [];
  const data: ActiveCall[] = raw.map((c) => ({
    callId: c.callId,
    linkedid: c.linkedid,
    ani: c.ani ?? '',
    dnis: c.dnis ?? '',
    queueName: c.queueName ?? '',
    sessionStatus: c.sessionStatus,
    startedAt: c.startedAt,
    queuedAt: c.queuedAt ?? undefined,
    answeredAt: c.answeredAt ?? undefined,
    primaryAgentId: c.primaryAgentId ?? undefined,
    latestTransfer: c.latestTransfer
      ? {
          phase: c.latestTransfer.phase,
          toExtension: c.latestTransfer.toExtension ?? undefined,
          requestedAt: c.latestTransfer.requestedAt ?? undefined,
          completedAt: c.latestTransfer.completedAt ?? null,
          expiredAt: c.latestTransfer.expiredAt ?? null,
        }
      : null,
    customer: c.customer
      ? {
          customerId: c.customer.customerId,
          customerName: c.customer.customerName ?? '미식별 고객',
          grade: c.customer.grade ?? 'NORMAL',
          phoneNumber: c.customer.phoneNumber ?? c.ani ?? '',
          companyName: c.customer.companyName ?? undefined,
          memo: c.customer.memo ?? undefined,
          recentOrders: Array.isArray(c.customer.recentOrders) ? c.customer.recentOrders : undefined,
        }
      : undefined,
    isMuted: c.isMuted === true,
  }));
  return { success: true, data, error: null };
}

export async function getCallHistory(): Promise<ApiResponse<CallHistoryItem[]>> {
  const agentId = useAuthStore.getState().agent?.agentId;
  const res = await apiClient.get('/calls/history', {
    params: {
      agentId,
      to: new Date().toISOString(),
    },
  });
  const raw: any[] = res.data?.data ?? [];
  const data: CallHistoryItem[] = raw.map((call) => ({
    callId: call.callId,
    customerName: call.customer?.customerName ?? '미식별 고객',
    phoneNumber: call.ani ?? call.dnis ?? '-',
    resultCode:
      call.callMemos?.[0]?.resultCode
      ?? call.resultCode
      ?? (call.answeredAt ? 'COMPLETED' : 'MISSED'),
    startedAt: call.startedAt,
    talkSeconds: call.talkSeconds ?? 0,
    queueName: call.queueName ?? '-',
  }));
  return { success: true, data, error: null };
}

export async function getAgents(): Promise<ApiResponse<AgentDirectoryItem[]>> {
  const res = await apiClient.get('/agents');
  const raw: any[] = res.data?.data ?? [];
  const data: AgentDirectoryItem[] = raw.map((agent) => ({
    agentId: agent.agentId,
    agentName: agent.agentName,
    extension: agent.extension,
    role: agent.role,
    isActive: agent.isActive !== false,
    currentStatus: agent.currentStatus
      ? {
          statusCode: agent.currentStatus.statusCode,
          reasonCode: agent.currentStatus.reasonCode ?? null,
          startedAt: agent.currentStatus.startedAt ?? undefined,
        }
      : null,
  }));
  return { success: true, data, error: null };
}

export async function updateAgentStatus(
  statusCode: AgentStatusCode,
): Promise<ApiResponse<{ statusCode: AgentStatusCode }>> {
  const agentId = useAuthStore.getState().agent?.agentId;
  if (!agentId) {
    return { success: false, data: { statusCode }, error: 'No agent' as any };
  }
  await apiClient.post(`/agents/${agentId}/status`, { statusCode });
  return { success: true, data: { statusCode }, error: null };
}

export async function saveCallMemo(
  callId: string,
  memo: string,
  resultCode: string,
): Promise<ApiResponse<{ callId: string; memo: string; resultCode: string }>> {
  const agentId = useAuthStore.getState().agent?.agentId ?? '';
  await apiClient.post(`/calls/${callId}/memo`, {
    agentId,
    memoType: 'acw',
    memoText: memo,
    resultCode,
    isFinal: true,
  });
  return { success: true, data: { callId, memo, resultCode }, error: null };
}

export async function transferCall(
  callId: string,
  target: string,
  mode: 'blind' | 'attended' = 'blind',
): Promise<ApiResponse<CommandAck & { callId: string; target: string; transferType?: 'blind' | 'attended'; to?: string; toExtension?: string }>> {
  const extension = useAuthStore.getState().agent?.extension ?? '';
  const res = await apiClient.post(`/calls/${callId}/transfer`, {
    transferType: mode,
    target,
    fromExtension: extension,
  });
  const data = res.data?.data;
  const ack = requireCommandAck(data);
  return {
    success: true,
    data: {
      ...(typeof data === 'object' && data ? data : {}),
      ...ack,
      callId: (data as { callId?: string } | undefined)?.callId ?? callId,
      target:
        (data as { target?: string; to?: string; toExtension?: string } | undefined)?.target
        ?? (data as { to?: string; toExtension?: string } | undefined)?.to
        ?? (data as { toExtension?: string } | undefined)?.toExtension
        ?? target,
    },
    error: null,
  };
}

export async function cancelAttendedTransferCall(
  callId: string,
): Promise<ApiResponse<CommandAck & { callId: string; canceled?: boolean }>> {
  const res = await apiClient.post(`/calls/${callId}/transfer/attended/cancel`);
  const data = res.data?.data;
  return {
    success: true,
    data: {
      ...(typeof data === 'object' && data ? data : {}),
      ...requireCommandAck(data),
    },
    error: null,
  };
}

export async function completeAttendedTransferCall(
  callId: string,
): Promise<ApiResponse<CommandAck & { callId: string }>> {
  const res = await apiClient.post(`/calls/${callId}/transfer/attended/complete`);
  const data = res.data?.data;
  return {
    success: true,
    data: {
      ...(typeof data === 'object' && data ? data : {}),
      ...requireCommandAck(data),
    },
    error: null,
  };
}

export async function pickupCall(
  callId: string,
): Promise<ApiResponse<CommandAck & { callId: string; extension?: string }>> {
  const res = await apiClient.post(`/calls/${callId}/pickup`);
  const data = res.data?.data;
  return {
    success: true,
    data: {
      ...(typeof data === 'object' && data ? data : {}),
      ...requireCommandAck(data),
    },
    error: null,
  };
}

export async function muteCall(
  callId: string,
  state: 'on' | 'off',
): Promise<ApiResponse<CommandAck & { callId: string; state: 'on' | 'off'; direction: string; isMuted?: boolean }>> {
  const res = await apiClient.post(`/calls/${callId}/mute`, {
    state,
    direction: 'all',
  });
  const data = res.data?.data;
  return {
    success: true,
    data: {
      ...(typeof data === 'object' && data ? data : {}),
      ...requireCommandAck(data),
    },
    error: null,
  };
}

export async function holdCall(
  callId: string,
  action: 'hold' | 'resume',
): Promise<ApiResponse<CommandAck & { callId: string; action: 'hold' | 'resume' }>> {
  const res = await apiClient.post(`/calls/${callId}/${action}`);
  const data = res.data?.data;
  return {
    success: true,
    data: {
      ...(typeof data === 'object' && data ? data : {}),
      ...requireCommandAck(data),
    },
    error: null,
  };
}

export async function hangupCall(
  callId: string,
): Promise<ApiResponse<CommandAck & { callId: string; endedAt?: string }>> {
  const res = await apiClient.post(`/calls/${callId}/hangup`);
  const data = res.data?.data;
  return {
    success: true,
    data: {
      ...(typeof data === 'object' && data ? data : {}),
      ...requireCommandAck(data),
    },
    error: null,
  };
}

export async function originateExternalCall(
  phoneNumber: string,
  callerId?: string,
): Promise<ApiResponse<CommandAck & { channel: string; phoneNumber: string; callerId?: string }>> {
  const agentExtension = useAuthStore.getState().agent?.extension ?? '';
  const res = await apiClient.post('/calls/originate', {
    agentExtension,
    phoneNumber,
    callerId,
  });
  const data = res.data?.data;
  const ack = requireCommandAck(data);
  return {
    success: true,
    data: {
      ...(typeof data === 'object' && data ? data : {}),
      ...ack,
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
  const res = await apiClient.post('/calls/originate/internal', {
    targetAgentId,
    targetExtension,
  });
  const data = res.data?.data;
  const ack = requireCommandAck(data);
  return {
    success: true,
    data: {
      ...(typeof data === 'object' && data ? data : {}),
      ...ack,
      targetAgentId,
      targetExtension,
    },
    error: null,
  };
}
