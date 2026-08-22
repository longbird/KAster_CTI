import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { EventBusService } from '../../events/event-bus.service';
import { AmiLeaderElectionService } from '../../redis/ami-leader-election.service';

@Injectable()
export class SessionRecoverySweeperService implements OnModuleInit {
  private readonly logger = new Logger(SessionRecoverySweeperService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly leader: AmiLeaderElectionService,
  ) {}

  onModuleInit(): void {
    setInterval(() => this.sweep().catch((error) => this.logger.error(error.message)), 15000);
  }

  async sweep() {
    if (!this.leader.isLeader()) return;

    const staleBefore = new Date(Date.now() - 10 * 60 * 1000);

    const staleSessions = await this.prisma.callSessions.findMany({
      where: {
        sessionStatus: { in: ['NEW', 'QUEUED', 'RINGING_AGENT', 'TALKING', 'AFTER_CALL_WORK', 'TRANSFERRING'] },
        updatedAt: { lt: staleBefore },
      },
      take: 100,
    });

    for (const session of staleSessions) {
      const ended = await this.prisma.callSessions.update({
        where: { callId: session.callId },
        data: {
          sessionStatus: 'ENDED',
          endedAt: session.endedAt ?? new Date(),
          resultCode: session.resultCode ?? 'RECOVERY_TIMEOUT',
        },
      });

      await this.eventBus.publish('call.ended', ended, ended.tenantId);
    }

    if (staleSessions.length) {
      this.logger.warn(`Recovered ${staleSessions.length} stale sessions`);
    }
  }
}
