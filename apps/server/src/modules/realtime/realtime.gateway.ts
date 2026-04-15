import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import * as jwt from 'jsonwebtoken';

// conv 22 + share 69de045b: WS handshake 는 access token 으로만 허용.
// 소켓 생성 후 auth.token (socket.io) 또는 query.token 에서 JWT 를 꺼내
// 검증하고, 실패 시 즉시 disconnect. 성공 시 tenantId/sub 를 socket.data 에 저장.
function parseCorsOrigin(): string | string[] {
  const raw = process.env.WS_CORS_ORIGIN || '*';
  if (raw === '*') return '*';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

@WebSocketGateway({
  cors: { origin: parseCorsOrigin() },
  namespace: '/ws',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: any;

  handleConnection(client: any) {
    try {
      const token: string | undefined =
        client.handshake?.auth?.token ||
        client.handshake?.query?.token ||
        this.parseBearer(client.handshake?.headers?.authorization);

      if (!token) {
        this.logger.warn(`WS rejected (no token): ${client.id}`);
        client.disconnect(true);
        return;
      }

      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET || 'change_me',
      ) as jwt.JwtPayload;

      client.data = client.data || {};
      client.data.sub = payload.sub;
      client.data.tenantId = payload.tenantId;
      client.data.role = payload.role;

      this.logger.log(`WS connected: ${client.id} sub=${payload.sub}`);
    } catch (err) {
      this.logger.warn(`WS rejected (invalid token): ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: any) {
    this.logger.log(`WS disconnected: ${client.id}`);
  }

  broadcast(event: string, payload: unknown) {
    if (this.server) {
      this.server.emit(event, payload);
    }
  }

  private parseBearer(header?: string): string | undefined {
    if (!header) return undefined;
    const m = /^Bearer\s+(.+)$/i.exec(header);
    return m?.[1];
  }
}
