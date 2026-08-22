import { SessionRecoverySweeperService } from './session-recovery-sweeper.service';

describe('SessionRecoverySweeperService tenant scoping', () => {
  // 복구로 끝낸 통화도 남의 회사 화면에 뜨면 안 된다.
  it('publishes the recovered call.ended under the session tenant', async () => {
    const stale = { callId: 'call-1', tenantId: 'tenant-1', endedAt: null, resultCode: null };
    const prisma = {
      callSessions: {
        findMany: jest.fn().mockResolvedValue([stale]),
        update: jest.fn().mockResolvedValue({
          ...stale,
          sessionStatus: 'ENDED',
          resultCode: 'RECOVERY_TIMEOUT',
        }),
      },
    } as any;
    const eventBus = { publish: jest.fn().mockResolvedValue(undefined) } as any;
    const leader = { isLeader: () => true } as any;
    const service = new SessionRecoverySweeperService(prisma, eventBus, leader);

    await service.sweep();

    expect(eventBus.publish).toHaveBeenCalledWith(
      'call.ended',
      expect.objectContaining({ callId: 'call-1' }),
      'tenant-1',
    );
  });
});
