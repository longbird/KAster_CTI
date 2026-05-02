import axios, { type AxiosInstance } from 'axios';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import type { AgentStatusCode, CommandAck, CtiEvent } from '../shared/cti';
import type {
  DesktopAgentDirectoryItem,
  DesktopCallerIdConfig,
  DesktopCallHistoryItem,
} from '../shared/ipc';

type RuntimeEventName = CtiEvent['type'];

const EVENT_NAMES: RuntimeEventName[] = [
  'call.created',
  'call.updated',
  'call.ended',
  'screenpop.customer',
  'agent.status.changed',
  'queue.summary.updated',
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
  ): Promise<{ statusCode: AgentStatusCode }> {
    const response = await this.http.post(`/agents/${agentId}/status`, { statusCode });

    return response.data.data as { statusCode: AgentStatusCode };
  }

  async originate(params: {
    agentExtension: string;
    phoneNumber: string;
    callerId?: string;
  }): Promise<CommandAck & { channel?: string }> {
    const correlationId = randomUUID();
    const response = await this.http.post(
      '/calls/originate',
      params,
      {
        headers: {
          'x-correlation-id': correlationId,
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
    const response = await this.http.get('/me/session');
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
      currentStatus?: { statusCode?: AgentStatusCode } | null;
    }) => ({
      agentId: agent.agentId ?? '',
      agentName: agent.agentName ?? '',
      extension: agent.extension ?? '',
      role: agent.role ?? 'agent',
      isActive: agent.isActive !== false,
      currentStatus: agent.currentStatus?.statusCode
        ? { statusCode: agent.currentStatus.statusCode }
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
