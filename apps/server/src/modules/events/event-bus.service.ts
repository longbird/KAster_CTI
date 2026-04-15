import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RedisService } from '../redis/redis.service';

// conv 44 + share 69de045b: 멀티 WS 노드에서 상담원 화면이 같은 상태를 보게
// 하려면 EventBus 는 Redis Pub/Sub 을 거쳐야 한다. publish 는 모든 노드에서
// 가능하고, 각 노드의 subscriber 가 로컬 WS 클라이언트에 broadcast 한다.
//
// 채널: kaster:cti:events (단일)
// 메시지: { event, payload, sourceNode }
// 필요하면 tenantId 로 채널을 쪼갤 수 있지만, 단일 테넌트 운용에서는 과잉.

const CHANNEL = 'kaster:cti:events';

const safeReplacer = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value;

@Injectable()
export class EventBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventBusService.name);
  private subClient: Redis | null = null;
  private readonly nodeId = `${process.pid}@${process.env.HOSTNAME || 'local'}`;

  constructor(
    private readonly realtimeGateway: RealtimeGateway,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    this.subClient = this.redis.createSubscriberClient();
    await this.subClient.subscribe(CHANNEL);
    this.subClient.on('message', (_channel, raw) => {
      try {
        const { event, payload } = JSON.parse(raw);
        this.realtimeGateway.broadcast(event, payload);
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

  async publish(event: string, payload: unknown) {
    const message = JSON.stringify({ event, payload, sourceNode: this.nodeId }, safeReplacer);
    try {
      await this.redis.getClient().publish(CHANNEL, message);
    } catch (err) {
      // Redis 장애 시에도 최소한 현재 노드의 WS 클라이언트는 받게 한다.
      this.logger.error(`redis publish failed, local fallback: ${(err as Error).message}`);
      this.realtimeGateway.broadcast(event, payload);
    }
  }
}
