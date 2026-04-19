import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { QueuesService } from '../queues/queues.service';
import { toRealtimeQueueSummary } from '../queues/realtime-queue-summary.util';

@Injectable()
export class AgentStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly queuesService: QueuesService,
  ) {}

  async changeStatus(agentId: string, statusCode: string, reasonCode?: string) {
    await this.prisma.agentStatusHistory.updateMany({
      where: { agentId, endedAt: null },
      data: {
        endedAt: new Date(),
      },
    });

    const agent = await this.prisma.agents.findUniqueOrThrow({ where: { agentId } });
    const row = await this.prisma.agentStatusHistory.create({
      data: {
        tenantId: agent.tenantId,
        agentId,
        statusCode: statusCode as any,
        reasonCode,
        startedAt: new Date(),
      },
    });

    await this.eventBus.publish('agent.status.changed', {
      agentId,
      statusCode,
      reasonCode: reasonCode ?? null,
    });

    const queueSummary = await this.queuesService.getSummary(agent.tenantId);
    await this.eventBus.publish(
      'queue.summary.updated',
      toRealtimeQueueSummary(queueSummary.data?.queues ?? []),
    );

    return row;
  }
}
