import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    this.client = this.buildClient();
  }

  private buildClient(): Redis {
    return new Redis({
      host: this.config.get<string>('REDIS_HOST', '127.0.0.1'),
      port: Number(this.config.get<string>('REDIS_PORT', '6379')),
      lazyConnect: false,
      maxRetriesPerRequest: null,
    });
  }

  getClient() {
    return this.client;
  }

  // ioredis 는 subscribe 모드로 들어가면 같은 연결에서 일반 명령을 못 쓰므로
  // EventBusService 처럼 pub/sub 이 필요한 곳은 전용 클라이언트를 하나 더 받는다.
  createSubscriberClient(): Redis {
    return this.buildClient();
  }

  async ping() {
    return this.client.ping();
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
