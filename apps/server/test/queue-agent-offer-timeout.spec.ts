import { QueuesService } from '../src/modules/queues/queues.service';
import { PrismaService } from '../src/common/prisma.service';
import { AsteriskReloadService } from '../src/modules/asterisk-config/asterisk-reload.service';
import { DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS } from '../src/common/call-routing.constants';

/**
 * 제안 대기 시간은 호분배룰(큐)이 들고 있다.
 *
 * 큐마다 성격이 다르기 때문이다 — 상담 큐는 상담원이 화면을 보고 판단할 시간이 필요하고,
 * 긴급 큐는 짧아야 한다. 테넌트에 하나뿐이면 둘 중 하나는 늘 틀린 값으로 돈다.
 */
describe('QueuesService 제안 대기 시간', () => {
  const prisma = {
    queues: {
      findFirst: jest.fn(),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ queueId: 'q-1', ...data })),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ queueId: 'q-1', ...data })),
    },
    queueOverflowRules: { findMany: jest.fn().mockResolvedValue([]) },
    queueAgentMembers: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(prisma)),
  };
  const reload = { scheduleReload: jest.fn() };

  let service: QueuesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new QueuesService(prisma as unknown as PrismaService, reload as unknown as AsteriskReloadService);
    // create 는 이름/내선 중복 검사에 findFirst 를 쓰고, update 는 대상 조회에 쓴다.
    // 한 목으로 둘 다 받으므로 무엇을 부르는지에 따라 갈라 준다.
    prisma.queues.findFirst.mockImplementation(async ({ where }: any) =>
      where?.queueId
        ? {
          queueId: 'q-1',
          tenantId: 'tenant-1',
          queueName: 'sales',
          queueExten: '10001',
          distributionMode: 'DISTRIBUTE',
          agentOfferTimeoutSeconds: 10,
        }
        : null);
  });

  it('호분배룰을 만들 때 대기 시간을 함께 저장한다', async () => {
    await service.create('tenant-1', {
      queueName: 'sales',
      queueExten: '10001',
      queueDisplayName: '영업',
      agentOfferTimeoutSeconds: 25,
    } as any);

    expect(prisma.queues.create.mock.calls[0][0].data.agentOfferTimeoutSeconds).toBe(25);
  });

  it('값을 안 주고 만들면 기본값 10초로 만든다', async () => {
    await service.create('tenant-1', {
      queueName: 'sales',
      queueExten: '10001',
      queueDisplayName: '영업',
    } as any);

    expect(prisma.queues.create.mock.calls[0][0].data.agentOfferTimeoutSeconds)
      .toBe(DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS);
  });

  it('수정하면 그 값이 반영된다', async () => {
    await service.update('tenant-1', 'q-1', { agentOfferTimeoutSeconds: 25 } as any);

    expect(prisma.queues.update.mock.calls[0][0].data.agentOfferTimeoutSeconds).toBe(25);
  });

  /**
   * 값을 안 보낸 수정이 대기 시간을 기본값으로 되돌리면, 다른 항목을 저장한 순간
   * 현장에서 맞춰 둔 대기 시간이 조용히 사라진다.
   */
  it('대기 시간을 보내지 않은 수정은 기존 값을 건드리지 않는다', async () => {
    await service.update('tenant-1', 'q-1', { queueDisplayName: '영업2' } as any);

    expect(prisma.queues.update.mock.calls[0][0].data.agentOfferTimeoutSeconds).toBeUndefined();
  });
});
