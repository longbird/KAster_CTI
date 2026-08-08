import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from './redis.service';

@Injectable()
export class AmiLeaderElectionService implements OnModuleInit {
  private readonly logger = new Logger(AmiLeaderElectionService.name);
  private readonly nodeId = randomUUID();
  private readonly lockKey = 'kaster:ami:leader';
  private isLeaderNode = false;
  // "리더가 아님" 과 "리더인지 알 수 없음" 은 다르다. Redis 를 못 쓰면 후자이고,
  // 그때는 어떤 노드도 리더가 아니므로 이벤트 보존 책임이 모든 노드에 생긴다.
  private leadershipKnown = false;

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
        this.leadershipKnown = true;
        return;
      }

      const current = await client.get(this.lockKey);
      if (current === this.nodeId) {
        await client.pexpire(this.lockKey, 10000);
        this.isLeaderNode = true;
        this.leadershipKnown = true;
        return;
      }

      this.isLeaderNode = false;
      this.leadershipKnown = true;
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
      this.leadershipKnown = false;
    }
  }

  isLeader() {
    return this.isLeaderNode;
  }

  /**
   * Redis 와 접촉해 리더십을 판정할 수 있었는지.
   *
   * false 면 "이 노드가 리더가 아니다" 가 아니라 "누가 리더인지 알 수 없다" 는 뜻이다.
   * 그 구간에는 아무도 리더가 아니므로 이벤트를 보존할 노드도 없다.
   */
  isLeadershipKnown() {
    return this.leadershipKnown;
  }

  getNodeId() {
    return this.nodeId;
  }
}
