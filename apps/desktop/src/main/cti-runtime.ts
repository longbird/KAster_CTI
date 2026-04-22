import axios, { type AxiosInstance } from 'axios';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import type { CommandAck, CtiEvent } from '../shared/cti';

type RuntimeEventName = CtiEvent['type'];

const EVENT_NAMES: RuntimeEventName[] = [
  'call.created',
  'call.updated',
  'call.ended',
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

  connect(listener: (event: CtiEvent) => void): void {
    this.disconnect();

    const socket = io(`${this.options.baseUrl}/ws`, {
      auth: { token: this.options.accessToken },
      transports: ['websocket'],
    });

    EVENT_NAMES.forEach((eventName) => {
      socket.on(eventName, (payload: CtiEvent['payload']) => {
        listener({
          type: eventName,
          payload,
        } as CtiEvent);
      });
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

  async hold(callId: string): Promise<CommandAck> {
    return this.sendSimpleCommand(`/calls/${callId}/hold`);
  }

  async resume(callId: string): Promise<CommandAck> {
    return this.sendSimpleCommand(`/calls/${callId}/resume`);
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
