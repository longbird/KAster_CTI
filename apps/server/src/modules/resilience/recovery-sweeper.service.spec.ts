import { RecoverySweeperService } from './recovery-sweeper.service';
import { OperatingModeService } from './operating-mode.service';

const T0 = new Date('2026-08-08T00:00:00.000Z');
const TENANT_A = '00000000-0000-0000-0000-00000000000a';
const TENANT_B = '00000000-0000-0000-0000-00000000000b';

function build(options: { mode?: 'NORMAL' | 'RECOVERING'; tenants?: string[]; spoolTenants?: string[] } = {}) {
  const operatingMode = new OperatingModeService({ get: (_k: string, d: any) => d } as any);
  if (options.mode === 'RECOVERING') {
    operatingMode.recordDbFailure(T0);
    operatingMode.recordDbRecovered(new Date(T0.getTime() + 1000));
  }

  const coordinator = {
    startRecovery: jest.fn().mockResolvedValue({
      batchId: 'b1', total: 0, success: 0, failure: 0, completed: true,
      pbxProbe: { reachable: true, channelCount: 0, queueEventCount: 0 },
    }),
  };
  const prisma = {
    tenants: {
      findMany: jest.fn().mockResolvedValue(
        (options.tenants ?? [TENANT_A]).map((tenantId) => ({ tenantId })),
      ),
    },
  };
  const localSpool = {
    listTenants: jest.fn().mockResolvedValue(options.spoolTenants ?? []),
  };
  const leader = { isLeader: () => true };

  const service = new RecoverySweeperService(
    prisma as any, localSpool as any, operatingMode, coordinator as any, leader as any,
  );
  return { service, coordinator, operatingMode, prisma, localSpool };
}

describe('RecoverySweeperService', () => {
  it('NORMAL 이면 아무것도 하지 않는다', async () => {
    const { service, coordinator } = build({ mode: 'NORMAL' });

    await service.sweep();

    expect(coordinator.startRecovery).not.toHaveBeenCalled();
  });

  it('RECOVERING 이면 테넌트별로 복구를 돌린다', async () => {
    const { service, coordinator } = build({ mode: 'RECOVERING', tenants: [TENANT_A, TENANT_B] });

    await service.sweep();

    expect(coordinator.startRecovery).toHaveBeenCalledWith(TENANT_A);
    expect(coordinator.startRecovery).toHaveBeenCalledWith(TENANT_B);
  });

  it('리더가 아니면 돌지 않는다', async () => {
    const { service, coordinator, operatingMode } = build({ mode: 'RECOVERING' });
    (service as any).leader = { isLeader: () => false };

    await service.sweep();

    expect(coordinator.startRecovery).not.toHaveBeenCalled();
    expect(operatingMode.getMode()).toBe('RECOVERING');
  });

  it('DB 를 못 읽어도 로컬 스풀에 남은 테넌트는 복구 대상에 넣는다', async () => {
    const { service, coordinator, prisma } = build({ mode: 'RECOVERING', spoolTenants: [TENANT_B] });
    prisma.tenants.findMany.mockRejectedValue(new Error('db down'));

    await service.sweep();

    expect(coordinator.startRecovery).toHaveBeenCalledWith(TENANT_B);
  });

  it('DB 테넌트와 스풀 테넌트가 겹치면 한 번만 처리한다', async () => {
    const { service, coordinator } = build({
      mode: 'RECOVERING', tenants: [TENANT_A], spoolTenants: [TENANT_A],
    });

    await service.sweep();

    expect(coordinator.startRecovery).toHaveBeenCalledTimes(1);
  });

  it('이전 sweep 이 아직 돌고 있으면 중복 실행하지 않는다', async () => {
    const { service, coordinator } = build({ mode: 'RECOVERING' });
    let release: () => void = () => undefined;
    // startRecovery 에 실제로 진입했음을 기다린다. 진입 전에 release 하면
    // 첫 sweep 이 영원히 끝나지 않는다.
    const entered = new Promise<void>((resolveEntered) => {
      coordinator.startRecovery.mockImplementation(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ completed: true } as any);
            resolveEntered();
          }),
      );
    });

    const first = service.sweep();
    await entered;

    await service.sweep(); // 겹치는 호출
    release();
    await first;

    expect(coordinator.startRecovery).toHaveBeenCalledTimes(1);
  });

  it('한 테넌트가 실패해도 다음 테넌트를 계속 처리한다', async () => {
    const { service, coordinator } = build({ mode: 'RECOVERING', tenants: [TENANT_A, TENANT_B] });
    coordinator.startRecovery
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ completed: true } as any);

    await expect(service.sweep()).resolves.toBeUndefined();

    expect(coordinator.startRecovery).toHaveBeenCalledTimes(2);
  });
});
