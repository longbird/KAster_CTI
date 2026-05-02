import { io, Socket } from 'socket.io-client';
import { WS_URL } from '../config';
import { getAccessToken } from '../store/useAuthStore';
import type { CtiEvent } from '../types/cti';

const REALTIME_EVENT_NAMES: CtiEvent['type'][] = [
  'call.created',
  'call.updated',
  'call.ended',
  'screenpop.customer',
  'agent.status.changed',
  'queue.summary.updated',
];

// 백엔드 RealtimeGateway 는 /ws namespace + socket.io 기본. handshake auth.token 으로 JWT 검증.
export function connectRealSocket(onEvent: (event: CtiEvent) => void): () => void {
  const token = getAccessToken();
  const socket: Socket = io(`${WS_URL}/ws`, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  const bind = (type: CtiEvent['type']) => {
    socket.on(type, (payload: any) => {
      onEvent({ type, payload } as CtiEvent);
    });
  };

  REALTIME_EVENT_NAMES.forEach(bind);

  socket.on('connect_error', (err) => {
    // eslint-disable-next-line no-console
    console.warn('WS connect_error', err.message);
  });

  return () => {
    socket.disconnect();
  };
}
