import { OutboxPublisherService } from './outbox-publisher.service';

function buildDeps(rows: any[]) {
  const prisma = {
    eventOutbox: {
      findMany: jest.fn().mockResolvedValue(rows),
      update: jest.fn().mockResolvedValue({}),
    },
    attendedTransferCandidates: { findFirst: jest.fn().mockResolvedValue(null) },
    customers: { findFirst: jest.fn().mockResolvedValue(null) },
    customerPhones: { findFirst: jest.fn().mockResolvedValue(null) },
    callSessions: { findMany: jest.fn().mockResolvedValue([]) },
    agents: { findFirst: jest.fn().mockResolvedValue(null) },
  } as any;
  const eventBus = { publish: jest.fn().mockResolvedValue(undefined) } as any;
  const leader = { isLeader: () => true } as any;
  const redis = {
    getClient: () => ({
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
    }),
  } as any;
  const queuesService = {
    getSummary: jest.fn().mockResolvedValue({ data: { queues: [] } }),
  } as any;

  return { prisma, eventBus, leader, redis, queuesService };
}

describe('OutboxPublisherService tenant scoping', () => {
  // outbox 행은 tenantId 를 들고 있다. 그걸 안 넘기면 A 사 통화 이벤트가
  // B 사 상담원 화면에 그대로 뜬다.
  it('publishes the outbox row under its own tenant', async () => {
    const { prisma, eventBus, leader, redis, queuesService } = buildDeps([
      {
        outboxId: 'outbox-1',
        tenantId: 'tenant-1',
        eventType: 'call.updated',
        payload: { callId: 'call-1', linkedid: 'linked-1' },
      },
    ]);
    const service = new OutboxPublisherService(prisma, eventBus, leader, redis, queuesService);

    await service.flush();

    expect(eventBus.publish).toHaveBeenCalledWith(
      'call.updated',
      expect.objectContaining({ callId: 'call-1' }),
      'tenant-1',
    );
  });

  it('scopes the derived screenpop and queue summary to the same tenant', async () => {
    const { prisma, eventBus, leader, redis, queuesService } = buildDeps([
      {
        outboxId: 'outbox-2',
        tenantId: 'tenant-1',
        eventType: 'call.created',
        payload: { callId: 'call-2', customerId: 'cust-1', linkedid: 'linked-2' },
      },
    ]);
    prisma.customers.findFirst.mockResolvedValue({
      customerId: 'cust-1',
      customerName: '홍길동',
      grade: 'NORMAL',
      phones: [{ phoneNumber: '01011112222' }],
    });
    const service = new OutboxPublisherService(prisma, eventBus, leader, redis, queuesService);

    await service.flush();

    const events = eventBus.publish.mock.calls.map((call: unknown[]) => call[0]);
    expect(events).toContain('screenpop.customer');
    expect(events).toContain('queue.summary.updated');
    for (const call of eventBus.publish.mock.calls) {
      expect(call[2]).toBe('tenant-1');
    }
  });
});
