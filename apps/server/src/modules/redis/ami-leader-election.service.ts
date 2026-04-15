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
    this.tick();
    setInterval(() => this.tick(), 5000);
  }

  private async tick() {
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
  }

  isLeader() {
    return this.isLeaderNode;
  }
}
