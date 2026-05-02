import axios, { type AxiosInstance } from 'axios';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import type { AgentStatusCode, CommandAck, CtiEvent } from '../shared/cti';

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
