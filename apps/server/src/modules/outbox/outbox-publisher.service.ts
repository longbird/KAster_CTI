import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { AmiLeaderElectionService } from '../redis/ami-leader-election.service';

@Injectable()
export class OutboxPublisherService implements OnModuleInit {
  private readonly logger = new Logger(OutboxPublisherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly leader: AmiLeaderElectionService,
  ) {}

  onModuleInit(): void {
    setInterval(() => this.flush().catch((error) => this.logger.error(error.message)), 3000);
  }

  async flush() {
    if (!this.leader.isLeader()) return;

    const pending = await this.prisma.eventOutbox.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    for (const row of pending) {
      await this.eventBus.publish(row.eventType, row.payload as any);
      await this.prisma.eventOutbox.update({
        where: { outboxId: row.outboxId },
        data: { publishedAt: new Date() },
      });
    }
  }
}
