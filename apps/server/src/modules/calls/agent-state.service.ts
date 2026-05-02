import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { QueuesService } from '../queues/queues.service';
import { toRealtimeQueueSummary } from '../queues/realtime-queue-summary.util';
import { REALTIME_EVENTS } from '../realtime/realtime-events';

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

    await this.eventBus.publish(REALTIME_EVENTS.AGENT_STATUS_CHANGED, {
      agentId,
      statusCode,
      reasonCode: reasonCode ?? null,
    }, agent.tenantId);

    const queueSummary = await this.queuesService.getSummary(agent.tenantId);
    await this.eventBus.publish(
      REALTIME_EVENTS.QUEUE_SUMMARY_UPDATED,
      toRealtimeQueueSummary(queueSummary.data?.queues ?? []),
      agent.tenantId,
    );

    return row;
  }
}
