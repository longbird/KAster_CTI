import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { QueuesService } from '../queues/queues.service';
import { toRealtimeQueueSummary } from '../queues/realtime-queue-summary.util';
import { AgentQueuePauseService } from './agent-queue-pause.service';

@Injectable()
export class AgentStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly queuesService: QueuesService,
    private readonly queuePause: AgentQueuePauseService,
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
    await this.queuePause.apply({
      tenantId: agent.tenantId,
      agentId,
      extension: agent.extension,
      statusCode,
      reason: reasonCode ?? statusCode,
    });

    await this.eventBus.publish('agent.status.changed', {
      agentId,
      statusCode,
      reasonCode: reasonCode ?? null,
    }, agent.tenantId);

    const queueSummary = await this.queuesService.getSummary(agent.tenantId);
    await this.eventBus.publish(
      'queue.summary.updated',
      toRealtimeQueueSummary(queueSummary.data?.queues ?? []),
      agent.tenantId,
    );

    return row;
  }

  /**
   * 로그아웃도 큐 pause 경로를 타야 한다.
   *
   * 이석 상태로 로그아웃하면 큐에서 빠진 채 남고, 재로그인해도 안 풀렸다.
   * 새 상태 행을 만들지 않는 이유: 로그아웃은 상태가 아니라 세션의 끝이라
   * 열린 행을 닫는 것으로 충분하고, 합성 상태 행을 만들면 관리자 화면의
   * 상담원 집계가 로그아웃한 사람까지 세기 시작한다.
   */
  async markLoggedOut(agentId: string) {
    const agent = await this.prisma.agents.findUniqueOrThrow({ where: { agentId } });

    await this.prisma.agentStatusHistory.updateMany({
      where: { agentId, endedAt: null },
      data: { endedAt: new Date() },
    });

    // 이 요청을 처리하는 시점에 상담원 소켓은 아직 안 닫혀 있을 수 있다.
    // presence 를 믿으면 로그아웃한 자리가 큐에 남는다.
    await this.queuePause.apply({
      tenantId: agent.tenantId,
      agentId,
      extension: agent.extension,
      statusCode: null,
      appConnected: false,
      reason: 'LOGGED_OUT',
    });

    const queueSummary = await this.queuesService.getSummary(agent.tenantId);
    await this.eventBus.publish(
      'queue.summary.updated',
      toRealtimeQueueSummary(queueSummary.data?.queues ?? []),
      agent.tenantId,
    );
  }
}
