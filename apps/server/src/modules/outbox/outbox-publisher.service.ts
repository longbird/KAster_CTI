import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { AmiLeaderElectionService } from '../redis/ami-leader-election.service';
import { RedisService } from '../redis/redis.service';
import { QueuesService } from '../queues/queues.service';
import { normalizePhone } from '../customers/customers.service';
import { toRealtimeQueueSummary } from '../queues/realtime-queue-summary.util';

@Injectable()
export class OutboxPublisherService implements OnModuleInit {
  private readonly logger = new Logger(OutboxPublisherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly leader: AmiLeaderElectionService,
    private readonly redis: RedisService,
    private readonly queuesService: QueuesService,
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
      const payload = await this.enrichPayload(row.eventType, row.tenantId, row.payload as any);
      await this.eventBus.publish(row.eventType, payload, row.tenantId);
      if (row.eventType === 'call.created' && payload?.customer) {
        await this.eventBus.publish('screenpop.customer', {
          callId: payload.callId,
          customer: payload.customer,
        }, row.tenantId);
      }
      if (row.eventType === 'call.created' || row.eventType === 'call.updated' || row.eventType === 'call.ended') {
        await this.publishQueueSummary(row.tenantId);
      }
      if (row.eventType === 'call.ended' && payload?.callId) {
        await this.redis.getClient().del(this.muteStateKey(payload.callId));
      }
      await this.prisma.eventOutbox.update({
        where: { outboxId: row.outboxId },
        data: { publishedAt: new Date() },
      });
    }
  }

  private muteStateKey(callId: string) {
    return `kaster:cti:call:${callId}:mute`;
  }

  private async publishQueueSummary(tenantId: string) {
    const queueSummary = await this.queuesService.getSummary(tenantId);
    await this.eventBus.publish(
      'queue.summary.updated',
      toRealtimeQueueSummary(queueSummary.data?.queues ?? []),
      tenantId,
    );
  }

  private async enrichPayload(
    eventType: string,
    tenantId: string,
    payload: Record<string, any>,
  ): Promise<Record<string, any>> {
    if (eventType !== 'call.created' && eventType !== 'call.updated' && eventType !== 'call.ended') {
      return payload;
    }

    const [latestTransfer, customer, primaryAgent, muteRaw] = await Promise.all([
      payload.linkedid
        ? this.prisma.attendedTransferCandidates.findFirst({
            where: { tenantId, linkedid: payload.linkedid },
            orderBy: { requestedAt: 'desc' },
            select: {
              phase: true,
              toExtension: true,
              requestedAt: true,
              completedAt: true,
              expiredAt: true,
            },
          })
        : Promise.resolve(null),
      this.resolveCustomerSummary(tenantId, payload),
      this.resolvePrimaryAgentSummary(tenantId, payload),
      payload.callId ? this.redis.getClient().get(this.muteStateKey(payload.callId)) : Promise.resolve(null),
    ]);

    const enriched = {
      ...payload,
      latestTransfer: latestTransfer ?? null,
      customer,
      primaryAgent,
      isMuted: muteRaw === '1',
    };

    return enriched;
  }

  private async resolveCustomerSummary(tenantId: string, payload: Record<string, any>) {
    if (payload.customerId) {
      const customer = await this.prisma.customers.findFirst({
        where: { tenantId, customerId: payload.customerId },
        include: {
          phones: {
            where: { isActive: true },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            take: 1,
          },
        },
      });
      if (customer) {
        const recentCalls = await this.prisma.callSessions.findMany({
          where: { tenantId, customerId: customer.customerId },
          orderBy: { startedAt: 'desc' },
          take: 5,
          select: {
            callId: true,
            direction: true,
            startedAt: true,
            queueName: true,
            sessionStatus: true,
          },
        });
        return {
          customerId: customer.customerId,
          customerName: customer.customerName ?? '미식별 고객',
          grade: customer.grade ?? 'NORMAL',
          phoneNumber: customer.phones[0]?.phoneNumber ?? '',
          companyName: customer.companyName ?? undefined,
          memo: customer.memo ?? undefined,
          lastCalledAt: customer.lastCalledAt?.toISOString() ?? undefined,
          recentCalls,
        };
      }
    }

    const normalizedAni = normalizePhone(payload.ani ?? '');
    if (!normalizedAni) return null;

    const phone = await this.prisma.customerPhones.findFirst({
      where: {
        normalizedPhone: normalizedAni,
        isActive: true,
        customer: { tenantId },
      },
      include: { customer: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    if (!phone) return null;

    const recentCalls = await this.prisma.callSessions.findMany({
      where: { tenantId, customerId: phone.customer.customerId },
      orderBy: { startedAt: 'desc' },
      take: 5,
      select: {
        callId: true,
        direction: true,
        startedAt: true,
        queueName: true,
        sessionStatus: true,
      },
    });

    return {
      customerId: phone.customer.customerId,
      customerName: phone.customer.customerName ?? '미식별 고객',
      grade: phone.customer.grade ?? 'NORMAL',
      phoneNumber: phone.phoneNumber,
      companyName: phone.customer.companyName ?? undefined,
      memo: phone.customer.memo ?? undefined,
      lastCalledAt: phone.customer.lastCalledAt?.toISOString() ?? undefined,
      recentCalls,
    };
  }

  private async resolvePrimaryAgentSummary(tenantId: string, payload: Record<string, any>) {
    if (!payload.primaryAgentId) return null;
    const agent = await this.prisma.agents.findFirst({
      where: { tenantId, agentId: payload.primaryAgentId },
      select: {
        agentId: true,
        agentName: true,
        extension: true,
        extensionDisplayName: true,
      },
    });
    return agent ?? null;
  }
}
