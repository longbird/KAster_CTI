import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RedisService } from '../redis/redis.service';

// conv 44 + share 69de045b: 멀티 WS 노드에서 상담원 화면이 같은 상태를 보게
// 하려면 EventBus 는 Redis Pub/Sub 을 거쳐야 한다. publish 는 모든 노드에서
// 가능하고, 각 노드의 subscriber 가 로컬 WS 클라이언트에 broadcast 한다.
//
// 채널: kaster:cti:events (단일)
// 메시지: { event, payload, sourceNode, tenantId? }

const CHANNEL = 'kaster:cti:events';

const safeReplacer = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value;

interface EventBusMessage {
  event: string;
  payload: unknown;
  sourceNode: string;
  tenantId?: string;
}

type EventBusListener = (event: string, payload: unknown, tenantId: string) => void | Promise<void>;

@Injectable()
export class EventBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventBusService.name);
  private subClient: Redis | null = null;
  private readonly nodeId = `${process.pid}@${process.env.HOSTNAME || 'local'}`;
  private readonly listeners = new Set<EventBusListener>();

  constructor(
    private readonly realtimeGateway: RealtimeGateway,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    this.subClient = this.redis.createSubscriberClient();
    await this.subClient.subscribe(CHANNEL);
    this.subClient.on('message', (_channel, raw) => {
      try {
        const { event, payload, tenantId } = JSON.parse(raw) as EventBusMessage;
        // 롤링 배포 중이면 tenantId 를 안 싣는 구버전 노드가 섞여 있을 수 있다.
        // 그 메시지를 전 테넌트로 뿌리면 회사 경계가 무너지므로 버린다.
        if (!tenantId) {
          this.logger.warn(`pubsub message dropped (no tenant): ${event}`);
          return;
        }
        this.realtimeGateway.broadcastToTenant(event, payload, tenantId);
        void this.notifyListeners(event, payload, tenantId);
      } catch (err) {
        this.logger.warn(`bad pubsub message: ${(err as Error).message}`);
      }
    });
    this.logger.log(`subscribed to ${CHANNEL} as ${this.nodeId}`);
  }

  async onModuleDestroy() {
    if (this.subClient) {
      try {
        await this.subClient.quit();
      } catch {
        // noop
      }
    }
  }

  /**
   * 모든 이벤트는 어느 회사의 것인지 밝혀야 한다. tenantId 가 선택 인자였을 때는
   * 빠뜨린 호출부의 이벤트가 접속한 전 테넌트로 나갔다.
   */
  async publish(event: string, payload: unknown, tenantId: string) {
    const message = JSON.stringify({ event, payload, sourceNode: this.nodeId, tenantId }, safeReplacer);
    try {
      await this.redis.getClient().publish(CHANNEL, message);
    } catch (err) {
      // Redis 장애 시에도 최소한 현재 노드의 WS 클라이언트는 받게 한다.
      this.logger.error(`redis publish failed, local fallback: ${(err as Error).message}`);
      this.realtimeGateway.broadcastToTenant(event, payload, tenantId);
      await this.notifyListeners(event, payload, tenantId);
    }
  }

  subscribe(listener: EventBusListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async notifyListeners(event: string, payload: unknown, tenantId: string) {
    for (const listener of this.listeners) {
      try {
        await listener(event, payload, tenantId);
      } catch (err) {
        this.logger.warn(`event listener failed for ${event}: ${(err as Error).message}`);
      }
    }
  }
}
