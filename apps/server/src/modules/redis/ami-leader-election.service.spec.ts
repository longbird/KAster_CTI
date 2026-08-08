import { AmiLeaderElectionService } from './ami-leader-election.service';

const redisOf = (client: any) => ({ getClient: () => client }) as any;

function buildClient(overrides: Partial<Record<'set' | 'get' | 'pexpire', jest.Mock>> = {}) {
  return {
    set: overrides.set ?? jest.fn().mockResolvedValue('OK'),
    get: overrides.get ?? jest.fn().mockResolvedValue(null),
    pexpire: overrides.pexpire ?? jest.fn().mockResolvedValue(1),
  };
}

describe('AmiLeaderElectionService', () => {
  it('락을 선점하면 리더가 된다', async () => {
    const client = buildClient();
    const service = new AmiLeaderElectionService(redisOf(client));

    await service.tick();

    expect(service.isLeader()).toBe(true);
  });

  it('다른 노드가 락을 쥐고 있으면 리더가 아니다', async () => {
    const client = buildClient({
      set: jest.fn().mockResolvedValue(null),
      get: jest.fn().mockResolvedValue('other-node'),
    });
    const service = new AmiLeaderElectionService(redisOf(client));

    await service.tick();

    expect(service.isLeader()).toBe(false);
    expect(client.pexpire).not.toHaveBeenCalled();
  });

  it('자기 락이면 TTL 을 갱신하고 리더를 유지한다', async () => {
    const client = buildClient({ set: jest.fn().mockResolvedValue(null) });
    const service = new AmiLeaderElectionService(redisOf(client));
    client.get.mockResolvedValue(service.getNodeId());

    await service.tick();

    expect(service.isLeader()).toBe(true);
    expect(client.pexpire).toHaveBeenCalledWith('kaster:ami:leader', 10000);
  });

  it('Redis 장애 시 예외를 밖으로 흘리지 않고 리더십을 내려놓는다', async () => {
    const client = buildClient({
      set: jest.fn().mockResolvedValueOnce('OK').mockRejectedValue(new Error('redis down')),
    });
    const service = new AmiLeaderElectionService(redisOf(client));

    await service.tick();
    expect(service.isLeader()).toBe(true);

    // reject 가 새어나가면 setInterval 콜백에서 unhandled rejection 이 된다.
    await expect(service.tick()).resolves.toBeUndefined();
    expect(service.isLeader()).toBe(false);
  });

  it('Redis 가 복구되면 리더십을 다시 잡는다', async () => {
    const client = buildClient({
      set: jest.fn().mockRejectedValueOnce(new Error('redis down')).mockResolvedValue('OK'),
    });
    const service = new AmiLeaderElectionService(redisOf(client));

    await service.tick();
    expect(service.isLeader()).toBe(false);

    await service.tick();
    expect(service.isLeader()).toBe(true);
  });

  it('TTL 갱신 단계에서 Redis 가 끊겨도 리더십을 내려놓는다', async () => {
    const client = buildClient({
      set: jest.fn().mockResolvedValue(null),
      get: jest.fn().mockRejectedValue(new Error('redis down mid-tick')),
    });
    const service = new AmiLeaderElectionService(redisOf(client));

    await expect(service.tick()).resolves.toBeUndefined();
    expect(service.isLeader()).toBe(false);
  });
});

describe('AmiLeaderElectionService 리더십 확인 가능 여부', () => {
  it('초기에는 아직 확인된 바가 없으므로 unknown 이다', () => {
    const service = new AmiLeaderElectionService(redisOf(buildClient()));

    expect(service.isLeadershipKnown()).toBe(false);
  });

  it('tick 이 정상 완료하면 known 이다', async () => {
    const service = new AmiLeaderElectionService(redisOf(buildClient()));

    await service.tick();

    expect(service.isLeadershipKnown()).toBe(true);
  });

  it('Redis 장애로 tick 이 실패하면 unknown 으로 돌아간다', async () => {
    // 이 값이 "리더가 아님" 과 "리더인지 알 수 없음" 을 구분한다.
    // 스풀 대상 판단이 여기에 걸려 있다.
    const client = buildClient({
      set: jest.fn().mockResolvedValueOnce('OK').mockRejectedValue(new Error('redis down')),
    });
    const service = new AmiLeaderElectionService(redisOf(client));

    await service.tick();
    expect(service.isLeadershipKnown()).toBe(true);

    await service.tick();
    expect(service.isLeadershipKnown()).toBe(false);
  });

  it('다른 노드가 리더여도 확인은 된 상태다', async () => {
    const client = buildClient({
      set: jest.fn().mockResolvedValue(null),
      get: jest.fn().mockResolvedValue('other-node'),
    });
    const service = new AmiLeaderElectionService(redisOf(client));

    await service.tick();

    expect(service.isLeader()).toBe(false);
    expect(service.isLeadershipKnown()).toBe(true);
  });
});
