import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import * as jwt from 'jsonwebtoken';
import { AgentPresenceService } from './agent-presence.service';

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

  // presence 만 주입한다. 큐 pause 재계산은 CallsModule 쪽(AgentQueuePauseService)이
  // presence 변경을 구독해서 처리한다 — 게이트웨이가 AsteriskManagerService 를 직접
  // 잡으면 Calls → Events → Realtime → Calls 로 모듈 순환이 생긴다.
  constructor(private readonly presence: AgentPresenceService) {}

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
      // 큐 pause 는 내선으로 걸린다. 소켓에 내선이 없으면 접속을 알아도 큐를 못 푼다.
      client.data.extension = payload.extension;
      if (payload.tenantId) {
        client.join(`tenant:${payload.tenantId}`);
      }

      if (payload.tenantId && payload.sub) {
        void this.presence.markConnected(payload.tenantId, payload.sub, client.id);
      }

      this.logger.log(`WS connected: ${client.id} sub=${payload.sub}`);
    } catch (err) {
      this.logger.warn(`WS rejected (invalid token): ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: any) {
    const tenantId = client.data?.tenantId;
    const agentId = client.data?.sub;
    if (tenantId && agentId) {
      void this.presence.markDisconnected(tenantId, agentId, client.id);
    }
    this.logger.log(`WS disconnected: ${client.id}`);
  }

  /**
   * 이벤트는 그 이벤트가 속한 회사의 방에만 넣는다.
   *
   * 이름과 타입이 둘 다 테넌트를 요구한다. 예전 `broadcast(event, payload, tenantId?)` 는
   * tenantId 를 빠뜨리면 조용히 접속한 모든 소켓으로 나갔고, 그래서 한 회사의 큐 요약이
   * 다른 회사 상담원 화면에 떴다. 실수하기 쉬운 기본값은 남겨두지 않는다.
   *
   * 테넌트를 모르는 이벤트는 전 테넌트로 흘리느니 버린다 — 한 건 놓치는 것보다
   * 회사 경계가 무너지는 쪽이 훨씬 비싸다.
   */
  broadcastToTenant(event: string, payload: unknown, tenantId: string) {
    if (!this.server) return;
    if (!tenantId) {
      this.logger.warn(`WS event dropped (no tenant): ${event}`);
      return;
    }
    this.server.to(`tenant:${tenantId}`).emit(event, payload);
  }

  getClientCount() {
    return this.server?.engine?.clientsCount ?? 0;
  }

  private parseBearer(header?: string): string | undefined {
    if (!header) return undefined;
    const m = /^Bearer\s+(.+)$/i.exec(header);
    return m?.[1];
  }
}
