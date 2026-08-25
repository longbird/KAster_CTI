import axios, { type AxiosInstance } from 'axios';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import type { AgentStatusCode, CallCapabilities, CommandAck, CtiEvent } from '../shared/cti';
import type {
  DesktopAgentDirectoryItem,
  DesktopCallContext,
  DesktopCallContextHistoryItem,
  DesktopCallContextMemo,
  DesktopCallerIdConfig,
  DesktopCallHistoryItem,
  DesktopSaveCallMemoInput,
} from '../shared/ipc';

type RuntimeEventName = CtiEvent['type'];

const EVENT_NAMES: RuntimeEventName[] = [
  'call.created',
  'call.updated',
  'call.ended',
  'screenpop.customer',
  'agent.status.changed',
  'queue.summary.updated',
  'announcement.pushed',
];

export class CtiRuntime {
  private readonly http: AxiosInstance;
  private socket: Socket | null = null;

  constructor(
    private readonly options: {
      baseUrl: string;
      accessToken: string;
    },
  ) {
    this.http = axios.create({
      baseURL: `${options.baseUrl}/api/v1`,
      timeout: 10000,
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
      },
    });
  }

  connect(handlers: {
    onEvent: (event: CtiEvent) => void;
    onConnectionState?: (payload: {
      state: 'connected' | 'reconnecting' | 'disconnected' | 'error';
      reason?: string;
    }) => void;
  }): void {
    this.disconnect();

    const socket = io(`${this.options.baseUrl}/ws`, {
      auth: { token: this.options.accessToken },
      transports: ['websocket'],
    });

    EVENT_NAMES.forEach((eventName) => {
      socket.on(eventName, (payload: CtiEvent['payload']) => {
        handlers.onEvent({
          type: eventName,
          payload,
        } as CtiEvent);
      });
    });
    socket.on('connect', () => {
      handlers.onConnectionState?.({ state: 'connected' });
    });
    socket.on('reconnect_attempt', (attempt: number) => {
      handlers.onConnectionState?.({ state: 'reconnecting', reason: `attempt:${attempt}` });
    });
    socket.on('disconnect', (reason: string) => {
      handlers.onConnectionState?.({ state: 'disconnected', reason });
    });
    socket.on('connect_error', (error: Error) => {
      handlers.onConnectionState?.({ state: 'error', reason: error.message });
    });

    this.socket = socket;
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  async mute(
    callId: string,
    state: 'on' | 'off',
  ): Promise<CommandAck & { callId: string; state: 'on' | 'off'; direction: string }> {
    const correlationId = randomUUID();
    const response = await this.http.post(
      `/calls/${callId}/mute`,
      { state, direction: 'all' },
      {
        headers: {
          'x-correlation-id': correlationId,
        },
      },
    );

    return response.data.data as CommandAck & { callId: string; state: 'on' | 'off'; direction: string };
  }

  async hangup(callId: string): Promise<CommandAck> {
    const correlationId = randomUUID();
    const response = await this.http.post(
      `/calls/${callId}/hangup`,
      {},
      {
        headers: {
          'x-correlation-id': correlationId,
        },
      },
    );

    return response.data.data as CommandAck;
  }

  async pickup(callId: string): Promise<CommandAck> {
    return this.sendSimpleCommand(`/calls/${callId}/pickup`);
  }

  async changeAgentStatus(
    agentId: string,
    statusCode: AgentStatusCode,
    reasonCode?: string,
  ): Promise<{ statusCode: AgentStatusCode }> {
    const response = await this.http.post(`/agents/${agentId}/status`, {
      statusCode,
      ...(reasonCode ? { reasonCode } : {}),
    });

    return response.data.data as { statusCode: AgentStatusCode };
  }

  async originate(params: {
    phoneNumber: string;
    callerId?: string;
  }): Promise<CommandAck & { channel?: string }> {
    const correlationId = randomUUID();
    const idempotencyKey = randomUUID();
    const commandId = randomUUID();
    const nonce = randomUUID();
    const response = await this.http.post(
      '/client/call-commands/originate',
      {
        commandId,
        phoneNumber: params.phoneNumber,
        ...(params.callerId ? { callerId: params.callerId } : {}),
      },
      {
        headers: {
          'x-correlation-id': correlationId,
          'idempotency-key': idempotencyKey,
          'x-client-protocol': 'kaster-desktop-v1',
          'x-command-timestamp': String(Date.now()),
          'x-command-nonce': nonce,
        },
      },
    );

    return response.data.data as CommandAck & { channel?: string };
  }

  async originateInternal(input: {
    targetAgentId: string;
    targetExtension: string;
  }): Promise<CommandAck> {
    const correlationId = randomUUID();
    const response = await this.http.post(
      '/calls/originate/internal',
      input,
      {
        headers: {
          'x-correlation-id': correlationId,
        },
      },
    );

    return response.data.data as CommandAck;
  }

  async getCallerIds(): Promise<DesktopCallerIdConfig> {
    const response = await this.http.get('/me/call-capabilities');
    const outboundDialOptions = response.data?.data?.outboundDialOptions;
    const callerIds = Array.isArray(outboundDialOptions?.allowedCallerIds)
      ? outboundDialOptions.allowedCallerIds.filter((value: unknown): value is string => typeof value === 'string')
      : [];
    const defaultCallerId = typeof outboundDialOptions?.defaultCallerId === 'string'
      ? outboundDialOptions.defaultCallerId
      : null;

    return {
      callerIds,
      defaultCallerId: defaultCallerId && callerIds.includes(defaultCallerId)
        ? defaultCallerId
        : callerIds[0] ?? null,
    };
  }

  async getCallCapabilities(): Promise<CallCapabilities> {
    const response = await this.http.get('/me/call-capabilities');
    const data = response.data?.data ?? {};
    const outboundDialOptions = data.outboundDialOptions ?? {};
    const allowedCallerIds = Array.isArray(outboundDialOptions.allowedCallerIds)
      ? outboundDialOptions.allowedCallerIds.filter((value: unknown): value is string => typeof value === 'string')
      : [];

    return {
      canOriginateExternal: data.canOriginateExternal === true,
      canOriginateInternal: data.canOriginateInternal !== false,
      canUsePhoneDirect: data.canUsePhoneDirect === true,
      outboundDialPermissions: {
        phoneDirect: data.canUsePhoneDirect === true,
        phoneDirectAllowedIps: Array.isArray(data.outboundDialPermissions?.phoneDirectAllowedIps)
          ? data.outboundDialPermissions.phoneDirectAllowedIps.filter((item: unknown) => typeof item === 'string')
          : [],
        domestic: data.outboundDialPermissions?.domestic !== false,
        representative: data.outboundDialPermissions?.representative !== false,
        paid: data.outboundDialPermissions?.paid === true,
        international: data.outboundDialPermissions?.international === true,
      },
      outboundDialOptions: {
        allowedCallerIds,
        defaultCallerId: typeof outboundDialOptions.defaultCallerId === 'string'
          ? outboundDialOptions.defaultCallerId
          : allowedCallerIds[0] ?? null,
      },
      disabledReasons: Array.isArray(data.disabledReasons)
        ? data.disabledReasons.filter((value: unknown): value is string => typeof value === 'string')
        : [],
    };
  }

  async getAgentDirectory(): Promise<DesktopAgentDirectoryItem[]> {
    const response = await this.http.get('/agents');
    const raw = response.data?.data;
    const rows = Array.isArray(raw?.agents)
      ? raw.agents
      : Array.isArray(raw)
        ? raw
        : [];

    return rows.map((agent: {
      agentId?: string;
      agentName?: string;
      extension?: string;
      role?: string;
      isActive?: boolean;
      loginStatus?: 'LOGGED_IN' | 'LOGGED_OUT' | 'UNKNOWN';
      sipRegistration?: {
        registered?: boolean;
        registrationStatus?: string;
        contactUri?: string | null;
        userAgent?: string | null;
        roundtripUsec?: number | null;
      } | null;
      canCall?: boolean;
      currentStatus?: { statusCode?: AgentStatusCode } | null;
      agentGroup?: {
        agentGroupId?: string;
        groupCode?: string;
        groupName?: string;
      } | null;
    }) => ({
      agentId: agent.agentId ?? '',
      agentName: agent.agentName ?? '',
      extension: agent.extension ?? '',
      role: agent.role ?? 'agent',
      isActive: agent.isActive !== false,
      loginStatus: agent.loginStatus ?? 'UNKNOWN',
      sipRegistration: {
        registered: agent.sipRegistration?.registered === true,
        registrationStatus: agent.sipRegistration?.registrationStatus ?? 'UNKNOWN',
        contactUri: agent.sipRegistration?.contactUri ?? null,
        userAgent: agent.sipRegistration?.userAgent ?? null,
        roundtripUsec: agent.sipRegistration?.roundtripUsec ?? null,
      },
      canCall: agent.canCall === true,
      currentStatus: agent.currentStatus?.statusCode
        ? { statusCode: agent.currentStatus.statusCode }
        : null,
      agentGroup: agent.agentGroup?.agentGroupId
        ? {
            agentGroupId: agent.agentGroup.agentGroupId,
            groupCode: agent.agentGroup.groupCode ?? '',
            groupName: agent.agentGroup.groupName ?? '',
          }
        : null,
    }));
  }

  async getCallHistory(): Promise<DesktopCallHistoryItem[]> {
    const response = await this.http.get('/calls/history');
    const rows = Array.isArray(response.data?.data) ? response.data.data : [];

    return rows.map((row: {
      callId?: string;
      ani?: string | null;
      dnis?: string | null;
      didNumber?: string | null;
      representativeNumber?: string | null;
      queueName?: string | null;
      sessionStatus?: string;
      direction?: string | null;
      startedAt?: string | Date;
      answeredAt?: string | Date | null;
      endedAt?: string | Date | null;
      talkSeconds?: number | null;
      waitSeconds?: number | null;
      primaryAgent?: { agentName?: string } | null;
      customer?: { customerName?: string } | null;
    }) => ({
      callId: row.callId ?? '',
      ani: row.ani ?? null,
      dnis: row.dnis ?? null,
      didNumber: row.didNumber ?? null,
      representativeNumber: row.representativeNumber ?? null,
      queueName: row.queueName ?? null,
      sessionStatus: row.sessionStatus ?? '',
      direction: row.direction ?? null,
      startedAt: String(row.startedAt ?? ''),
      answeredAt: row.answeredAt ? String(row.answeredAt) : null,
      endedAt: row.endedAt ? String(row.endedAt) : null,
      talkSeconds: typeof row.talkSeconds === 'number' ? row.talkSeconds : null,
      waitSeconds: typeof row.waitSeconds === 'number' ? row.waitSeconds : null,
      primaryAgent: row.primaryAgent?.agentName ? { agentName: row.primaryAgent.agentName } : null,
      customer: row.customer?.customerName ? { customerName: row.customer.customerName } : null,
    }));
  }

  async getCallContext(callId: string): Promise<DesktopCallContext | null> {
    const response = await this.http.get(`/calls/${callId}`);
    const data = response.data?.data;
    if (!data) {
      return null;
    }

    const customer = data.customer
      ? {
          customerId: String(data.customer.customerId ?? ''),
          customerName: String(data.customer.customerName ?? ''),
          grade: data.customer.grade ?? null,
          memo: data.customer.memo ?? null,
          primaryPhoneNumber:
            data.customer.phones?.find((p: { isPrimary?: boolean }) => p.isPrimary)?.phoneNumber
            ?? data.customer.phones?.[0]?.phoneNumber
            ?? null,
          extraPhoneNumbers: Array.isArray(data.customer.phones)
            ? data.customer.phones
                .filter((p: { isPrimary?: boolean }) => !p.isPrimary)
                .map((p: { phoneNumber?: string }) => p.phoneNumber ?? '')
                .filter(Boolean)
            : [],
        }
      : null;

    const history: DesktopCallContextHistoryItem[] = Array.isArray(data.customerHistory)
      ? data.customerHistory.map((row: {
          callId?: string;
          direction?: string | null;
          sessionStatus?: string;
          startedAt?: string | Date;
          answeredAt?: string | Date | null;
          endedAt?: string | Date | null;
          talkSeconds?: number | null;
          queueName?: string | null;
          primaryAgent?: { agentName?: string } | null;
        }) => ({
          callId: row.callId ?? '',
          direction: row.direction ?? null,
          sessionStatus: row.sessionStatus ?? '',
          startedAt: String(row.startedAt ?? ''),
          answeredAt: row.answeredAt ? String(row.answeredAt) : null,
          endedAt: row.endedAt ? String(row.endedAt) : null,
          talkSeconds: typeof row.talkSeconds === 'number' ? row.talkSeconds : null,
          queueName: row.queueName ?? null,
          primaryAgentName: row.primaryAgent?.agentName ?? null,
        }))
      : [];

    const memos: DesktopCallContextMemo[] = Array.isArray(data.callMemos)
      ? data.callMemos.map((memo: {
          callMemoId?: string;
          agentId?: string | null;
          memoType?: string | null;
          resultCode?: string | null;
          subResultCode?: string | null;
          memoText?: string | null;
          isFinal?: boolean | null;
          createdAt?: string | Date;
        }) => ({
          callMemoId: memo.callMemoId ?? '',
          agentId: memo.agentId ?? null,
          memoType: memo.memoType ?? null,
          resultCode: memo.resultCode ?? null,
          subResultCode: memo.subResultCode ?? null,
          memoText: memo.memoText ?? null,
          isFinal: memo.isFinal ?? null,
          createdAt: String(memo.createdAt ?? ''),
        }))
      : [];

    return {
      callId: String(data.callId ?? callId),
      customer,
      representativeNumber: data.representativeNumber ?? null,
      history,
      memos,
    };
  }

  async saveCallMemo(input: DesktopSaveCallMemoInput): Promise<DesktopCallContextMemo> {
    const { callId, ...body } = input;
    const response = await this.http.post(`/calls/${callId}/memo`, {
      agentId: body.agentId,
      memoType: body.memoType ?? 'acw',
      memoText: body.memoText,
      resultCode: body.resultCode,
      subResultCode: body.subResultCode,
      isFinal: body.isFinal ?? true,
    });
    const memo = response.data?.data ?? {};
    return {
      callMemoId: memo.callMemoId ?? '',
      agentId: memo.agentId ?? null,
      memoType: memo.memoType ?? null,
      resultCode: memo.resultCode ?? null,
      subResultCode: memo.subResultCode ?? null,
      memoText: memo.memoText ?? null,
      isFinal: memo.isFinal ?? null,
      createdAt: String(memo.createdAt ?? ''),
    };
  }

  async hold(callId: string): Promise<CommandAck> {
    return this.sendSimpleCommand(`/calls/${callId}/hold`);
  }

  async resume(callId: string): Promise<CommandAck> {
    return this.sendSimpleCommand(`/calls/${callId}/resume`);
  }

  async transfer(
    callId: string,
    params: {
      target: string;
      transferType: 'blind' | 'attended';
      fromExtension: string;
    },
  ): Promise<CommandAck> {
    const correlationId = randomUUID();
    const response = await this.http.post(
      `/calls/${callId}/transfer`,
      params,
      {
        headers: {
          'x-correlation-id': correlationId,
        },
      },
    );

    return response.data.data as CommandAck;
  }

  async cancelAttendedTransfer(callId: string): Promise<CommandAck> {
    return this.sendSimpleCommand(`/calls/${callId}/transfer/attended/cancel`);
  }

  async completeAttendedTransfer(callId: string): Promise<CommandAck> {
    return this.sendSimpleCommand(`/calls/${callId}/transfer/attended/complete`);
  }

  private async sendSimpleCommand(path: string): Promise<CommandAck> {
    const correlationId = randomUUID();
    const response = await this.http.post(
      path,
      {},
      {
        headers: {
          'x-correlation-id': correlationId,
        },
      },
    );

    return response.data.data as CommandAck;
  }
}
