import {
  AGENT_OFFER_CLOSED_EVENT,
  AGENT_OFFER_DECIDED_EVENT,
  AGENT_OFFER_EVENT,
  AgentOfferService,
} from './agent-offer.service';

type Listener = (event: string, payload: unknown, tenantId?: string) => void;

function makeService() {
  let listener: Listener = () => {};
  const publish = jest.fn(async (event: string, payload: unknown, tenantId?: string) => {
    // Redis Pub/Sub 은 발행한 노드에도 되돌아온다. 그 왕복을 흉내 낸다.
    listener(event, payload, tenantId);
  });
  const eventBus = {
    publish,
    subscribe: (fn: Listener) => { listener = fn; return () => {}; },
  };

  const service = new AgentOfferService(eventBus as any);
  service.onModuleInit();
  return { service, publish };
}

const REQUEST = {
  tenantId: 'tenant-1',
  linkedid: '1787355742.21',
  extension: '1001',
  caller: '01034623453',
  timeoutSeconds: 10,
};

describe('AgentOfferService', () => {
  afterEach(() => jest.useRealTimers());

  it('상담원 앱이 볼 수 있도록 제안을 내보낸다', async () => {
    const { service, publish } = makeService();

    const pending = service.waitForDecision(REQUEST);
    await Promise.resolve();

    expect(publish).toHaveBeenCalledWith(
      AGENT_OFFER_EVENT,
      expect.objectContaining({ extension: '1001', caller: '01034623453' }),
      'tenant-1',
    );

    await service.submitDecision({ ...REQUEST, decision: 'ACCEPT' });
    await expect(pending).resolves.toBe('ACCEPT');
  });

  it('거절도 그대로 돌려준다', async () => {
    const { service } = makeService();

    const pending = service.waitForDecision(REQUEST);
    await Promise.resolve();
    await service.submitDecision({ ...REQUEST, decision: 'REJECT' });

    await expect(pending).resolves.toBe('REJECT');
  });

  /**
   * 상담원이 자리를 비웠을 수 있다. 무한정 기다리면 발신자가 큐에 갇힌 채
   * 다음 상담원에게 넘어가지 못한다.
   */
  it('상담원이 안 누르면 시간이 지나 TIMEOUT 이 된다', async () => {
    jest.useFakeTimers();
    const { service } = makeService();

    const pending = service.waitForDecision({ ...REQUEST, timeoutSeconds: 3 });
    await Promise.resolve();
    jest.advanceTimersByTime(3000);

    await expect(pending).resolves.toBe('TIMEOUT');
  });

  // 다른 상담원이 받았거나 시간이 지났으면 화면에 뜬 제안이 사라져야 한다.
  it('끝난 제안은 화면에서 내리라고 알린다', async () => {
    const { service, publish } = makeService();

    const pending = service.waitForDecision(REQUEST);
    await Promise.resolve();
    await service.submitDecision({ ...REQUEST, decision: 'ACCEPT' });
    await pending;

    expect(publish).toHaveBeenCalledWith(
      AGENT_OFFER_CLOSED_EVENT,
      expect.objectContaining({ extension: '1001', decision: 'ACCEPT' }),
      'tenant-1',
    );
  });

  /**
   * 결정은 Redis 를 돌아 자기 노드에도 되돌아온다. 두 번 처리하면 이미 풀린 제안을
   * 또 풀거나, 다음 통화의 같은 제안을 엉뚱하게 닫는다.
   */
  it('같은 결정이 두 번 와도 한 번만 처리한다', async () => {
    const { service, publish } = makeService();

    const pending = service.waitForDecision(REQUEST);
    await Promise.resolve();
    await service.submitDecision({ ...REQUEST, decision: 'ACCEPT' });
    await pending;

    publish.mockClear();
    await service.submitDecision({ ...REQUEST, decision: 'REJECT' });

    expect(publish).not.toHaveBeenCalledWith(AGENT_OFFER_CLOSED_EVENT, expect.anything(), expect.anything());
  });

  it('기다리는 제안이 없으면 그렇다고 답한다', () => {
    const { service } = makeService();

    expect(service.isPending('1787355742.21', '1001')).toBe(false);
  });

  it('기다리는 동안에는 그 제안을 알고 있다', async () => {
    const { service } = makeService();

    const pending = service.waitForDecision(REQUEST);
    await Promise.resolve();
    expect(service.isPending(REQUEST.linkedid, REQUEST.extension)).toBe(true);

    await service.submitDecision({ ...REQUEST, decision: 'ACCEPT' });
    await pending;
    expect(service.isPending(REQUEST.linkedid, REQUEST.extension)).toBe(false);
  });

  it('결정은 기다리는 노드가 받도록 내보낸다', async () => {
    const { service, publish } = makeService();

    await service.submitDecision({ ...REQUEST, decision: 'REJECT' });

    expect(publish).toHaveBeenCalledWith(
      AGENT_OFFER_DECIDED_EVENT,
      expect.objectContaining({ decision: 'REJECT' }),
      'tenant-1',
    );
  });
});
