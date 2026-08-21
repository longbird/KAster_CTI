import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { QueuesService } from '../queues/queues.service';
import { toRealtimeQueueSummary } from '../queues/realtime-queue-summary.util';
import { AsteriskManagerService } from './asterisk-manager.service';
import { pausesQueueAssignment } from './agent-availability.util';

@Injectable()
export class AgentStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly queuesService: QueuesService,
    private readonly asteriskManager: AsteriskManagerService,
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

    // 상태만 적어 두면 큐는 그대로 배정한다. 화면에는 "이석" 인데 책상 전화기가 울린다.
    // 상태와 큐 일시정지는 함께 움직여야 뜻이 맞는다.
    this.asteriskManager.setQueuePaused(
      agent.extension,
      pausesQueueAssignment(statusCode),
      reasonCode ?? statusCode,
    );

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
