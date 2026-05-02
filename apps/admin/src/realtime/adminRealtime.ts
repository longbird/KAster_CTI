import { io as socketIo } from 'socket.io-client';
import { WS_BASE_URL } from '../config';
import { getAccessToken } from '../store/useAuthStore';

export const ADMIN_REALTIME_EVENTS = [
  'call.created',
  'call.updated',
  'call.ended',
  'agent.status.changed',
  'queue.summary.updated',
] as const;

export type AdminRealtimeEventName = (typeof ADMIN_REALTIME_EVENTS)[number];

export interface AdminRealtimeEvent<TPayload = unknown> {
  type: AdminRealtimeEventName;
  payload: TPayload;
}

interface AdminRealtimeSocket {
  on: (event: AdminRealtimeEventName, handler: (payload: unknown) => void) => void;
  disconnect: () => void;
}

type AdminRealtimeAuthOption = { token: string } | ((callback: (auth: { token: string | null }) => void) => void);

interface AdminRealtimeDeps {
  getAccessToken: () => string | null;
  io: (url: string, options: { auth: AdminRealtimeAuthOption; transports: string[] }) => AdminRealtimeSocket;
  wsBaseUrl: string;
}

const DEFAULT_DEPS: AdminRealtimeDeps = {
  getAccessToken,
  io: socketIo as AdminRealtimeDeps['io'],
  wsBaseUrl: WS_BASE_URL,
};

export function connectAdminRealtime(
  onEvent: (event: AdminRealtimeEvent) => void,
  deps: AdminRealtimeDeps = DEFAULT_DEPS,
): () => void {
  const token = deps.getAccessToken();
  if (!token) {
    return () => undefined;
  }

  const socket = deps.io(`${deps.wsBaseUrl.replace(/\/$/, '')}/ws`, {
    auth: (callback) => callback({ token: deps.getAccessToken() }),
    transports: ['websocket', 'polling'],
  });

  ADMIN_REALTIME_EVENTS.forEach((eventName) => {
    socket.on(eventName, (payload) => {
      onEvent({ type: eventName, payload });
    });
  });

  return () => socket.disconnect();
}

export function shouldRefreshDashboardForRealtimeEvent(eventName: string): eventName is AdminRealtimeEventName {
  return ADMIN_REALTIME_EVENTS.includes(eventName as AdminRealtimeEventName);
}
