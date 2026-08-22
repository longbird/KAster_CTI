import { AdminService } from '../src/modules/admin/admin.service';
import { DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS } from '../src/common/call-routing.constants';

function createService() {
  const prisma = {
    tenants: {
      findUnique: jest.fn().mockResolvedValue({ timezone: 'Asia/Seoul' }),
      update: jest.fn().mockResolvedValue({}),
    },
    tenantSystemSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(async ({ create }: any) => create),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ now: new Date() }]),
  } as any;

  const asteriskReloadService = { executeReload: jest.fn() } as any;

  return {
    prisma,
    service: new AdminService(
      prisma,
      {} as any,
      asteriskReloadService,
      {} as any,
      {} as any,
      { publish: jest.fn() } as any,
    ),
  };
}

const BASE_DTO = {
  recordingEnabled: true,
  defaultMaxWaitSeconds: 45,
  allowDirectSipDial: false,
  allowedOutboundCallerIds: '07052346380',
  defaultOutboundCallerId: '07052346380',
  sipRegisterPort: 48950,
  timezone: 'Asia/Seoul',
  dateFormat: 'YYYY-MM-DD HH:mm:ss',
};

describe('AdminService 상담원 제안 대기 시간 설정', () => {
  it('설정이 없는 테넌트는 기본 대기 시간을 돌려준다', async () => {
    const { service } = createService();

    const result = await service.getSystemSettings('tenant-1');

    expect(result.data.agentOfferTimeoutSeconds).toBe(DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS);
  });

  it('저장된 대기 시간을 그대로 돌려준다', async () => {
    const { prisma, service } = createService();
    prisma.tenantSystemSettings.findUnique.mockResolvedValue({
      recordingEnabled: true,
      recordingChannelMode: 'MONO',
      defaultMaxWaitSeconds: 45,
      agentOfferTimeoutSeconds: 25,
      timezone: 'Asia/Seoul',
      dateFormat: 'YYYY-MM-DD HH:mm:ss',
    });

    const result = await service.getSystemSettings('tenant-1');

    expect(result.data.agentOfferTimeoutSeconds).toBe(25);
  });

  it('저장하면 대기 시간이 테넌트 설정에 반영된다', async () => {
    const { prisma, service } = createService();

    await service.updateSystemSettings('tenant-1', {
      ...BASE_DTO,
      agentOfferTimeoutSeconds: 25,
    } as any);

    const call = prisma.tenantSystemSettings.upsert.mock.calls[0][0];
    expect(call.create.agentOfferTimeoutSeconds).toBe(25);
    expect(call.update.agentOfferTimeoutSeconds).toBe(25);
  });

  /**
   * 값을 안 보낸 요청이 대기 시간을 기본값으로 되돌리면, 다른 설정을 저장한 순간
   * 현장에서 맞춰둔 대기 시간이 조용히 사라진다.
   */
  it('대기 시간을 보내지 않은 저장은 기존 값을 건드리지 않는다', async () => {
    const { prisma, service } = createService();

    await service.updateSystemSettings('tenant-1', { ...BASE_DTO } as any);

    const call = prisma.tenantSystemSettings.upsert.mock.calls[0][0];
    expect(call.update.agentOfferTimeoutSeconds).toBeUndefined();
  });
});
