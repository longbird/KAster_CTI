import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from './redis.service';

@Injectable()
export class AmiLeaderElectionService implements OnModuleInit {
  private readonly logger = new Logger(AmiLeaderElectionService.name);
  private readonly nodeId = randomUUID();
  private readonly lockKey = 'kaster:ami:leader';
  private isLeaderNode = false;

  constructor(private readonly redis: RedisService) {}

  onModuleInit(): void {
    // tick() 은 스스로 예외를 흡수하지만, 혹시라도 새면 setInterval 콜백에서
    // unhandled rejection 이 되므로 void 로 명시해 둔다.
    void this.tick();
    setInterval(() => void this.tick(), 5000);
  }

  async tick() {
    try {
      const client = this.redis.getClient();
      const result = await client.set(this.lockKey, this.nodeId, 'PX', 10000, 'NX');

      if (result === 'OK') {
        if (!this.isLeaderNode) {
          this.logger.log(`Leadership acquired by ${this.nodeId}`);
        }
        this.isLeaderNode = true;
        return;
      }

      const current = await client.get(this.lockKey);
      if (current === this.nodeId) {
        await client.pexpire(this.lockKey, 10000);
        this.isLeaderNode = true;
        return;
      }

      this.isLeaderNode = false;
    } catch (err) {
      // Redis 를 못 쓰면 리더십을 증명할 수 없다. 붙잡고 있으면 Redis 복구 후
      // 다른 노드와 동시에 리더가 되는 split-brain 이 되므로 fail-safe 로 내려놓는다.
      // 이 구간의 이벤트 유실은 durable spool 이 막는다 (spool 은 리더 게이트 앞에서 동작).
      if (this.isLeaderNode) {
        this.logger.warn(
          `Leadership released: redis unavailable (${(err as Error).message})`,
        );
      }
      this.isLeaderNode = false;
    }
  }

  isLeader() {
    return this.isLeaderNode;
  }

  getNodeId() {
    return this.nodeId;
  }
}
