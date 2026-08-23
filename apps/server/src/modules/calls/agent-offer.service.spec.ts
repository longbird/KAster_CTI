import { Logger } from '@nestjs/common';
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
   * 이 프로젝트에서 실제로 난 사고다. 옆 상담원이 먼저 받았는데도 진 쪽 화면에는
   * "받으시겠습니까?" 가 그대로 남았다.
   *
   * PBX 신호로는 못 잡는다 — 진 쪽 Local 채널이 끊겨도 AGI 는 `urlopen()` 안에서 막혀 있어
   * 롱폴 연결이 그대로 살아 있다. 누가 받았다는 사실로 닫아야 한다.
   */
  it('한 상담원이 받으면 같은 호를 물어봐 둔 다른 자리도 닫는다', async () => {
    const { service, publish } = makeService();

    const winner = service.waitForDecision(REQUEST);
    const loser = service.waitForDecision({ ...REQUEST, extension: '1002' });
    await Promise.resolve();

    await service.submitDecision({ ...REQUEST, decision: 'ACCEPT' });

    await expect(winner).resolves.toBe('ACCEPT');
    await expect(loser).resolves.toBe('ABANDONED');

    // 화면의 제안은 이 알림으로만 내려간다.
    expect(publish).toHaveBeenCalledWith(
      AGENT_OFFER_CLOSED_EVENT,
      expect.objectContaining({ extension: '1002', decision: 'ABANDONED' }),
      'tenant-1',
    );
  });

  /** 다른 호의 제안까지 같이 내리면 멀쩡히 울리던 전화가 사라진다. */
  it('다른 호의 제안은 건드리지 않는다', async () => {
    jest.useFakeTimers();
    const { service } = makeService();

    const other = service.waitForDecision({ ...REQUEST, linkedid: '1787355742.99', extension: '1002' });
    const accepted = service.waitForDecision(REQUEST);
    await Promise.resolve();

    await service.submitDecision({ ...REQUEST, decision: 'ACCEPT' });
    await expect(accepted).resolves.toBe('ACCEPT');

    jest.advanceTimersByTime(10_000);
    await expect(other).resolves.toBe('TIMEOUT');
  });

  /**
   * AGI 재시도가 이미 떠 있는 제안에 합류하는 길. 예전에는 그 길이 곧장 return 해서
   * 결정을 받고도 닫힘을 안 알렸고, 화면의 제안이 영영 안 내려갔다.
   */
  it('이미 떠 있는 제안에 합류해도 닫힘을 알린다', async () => {
    const { service, publish } = makeService();

    const first = service.waitForDecision(REQUEST);
    await Promise.resolve();
    publish.mockClear();

    const second = service.waitForDecision(REQUEST);
    await Promise.resolve();

    await service.submitDecision({ ...REQUEST, decision: 'ACCEPT' });

    await expect(first).resolves.toBe('ACCEPT');
    await expect(second).resolves.toBe('ACCEPT');
    expect(publish).toHaveBeenCalledWith(
      AGENT_OFFER_CLOSED_EVENT,
      expect.objectContaining({ offerId: '1787355742.21:1001', decision: 'ACCEPT' }),
      'tenant-1',
    );
  });

  /**
   * 앞선 연결이 끊겼다고 제안을 닫으면, 그 제안을 넘겨받아 기다리던 재시도까지 같이 죽는다.
   * 그러면 상담원이 누른 수락이 아무 데도 도착하지 않는다.
   */
  it('아직 기다리는 연결이 남아 있으면 제안을 닫지 않는다', async () => {
    const { service } = makeService();

    let abandonFirst = () => {};
    const first = service.waitForDecision(REQUEST, (abandon) => { abandonFirst = abandon; });
    await Promise.resolve();

    const second = service.waitForDecision(REQUEST);
    await Promise.resolve();

    abandonFirst();
    await expect(first).resolves.toBe('ABANDONED');

    await service.submitDecision({ ...REQUEST, decision: 'ACCEPT' });
    await expect(second).resolves.toBe('ACCEPT');
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

  /**
   * 다른 상담원이 먼저 받으면 Asterisk 가 진 쪽 Local 채널을 끊는다. 그러면 AGI 의 롱폴 연결만
   * 끊길 뿐이라, 이걸 잡지 않으면 진 상담원 화면에 이미 끝난 전화의 수락 버튼이 타임아웃까지 남는다.
   */
  it('롱폴 연결이 끊기면 제안을 닫는다', async () => {
    const { service, publish } = makeService();

    let abandon = () => {};
    const pending = service.waitForDecision(REQUEST, (hook) => { abandon = hook; });
    await Promise.resolve();

    abandon();

    await expect(pending).resolves.toBe('ABANDONED');
    expect(publish).toHaveBeenCalledWith(
      AGENT_OFFER_CLOSED_EVENT,
      expect.objectContaining({ extension: '1001', decision: 'ABANDONED' }),
      'tenant-1',
    );
    expect(service.isPending(REQUEST.linkedid, REQUEST.extension)).toBe(false);
  });

  /**
   * 정상 응답 뒤에도 연결은 닫힌다. 그때까지 중단으로 처리하면 이미 수락된 제안을
   * 한 번 더 닫아, 다음 통화의 같은 제안을 엉뚱하게 내린다.
   */
  it('정상 응답 뒤에 오는 연결 종료는 무시한다', async () => {
    const { service, publish } = makeService();

    let abandon = () => {};
    const pending = service.waitForDecision(REQUEST, (hook) => { abandon = hook; });
    await Promise.resolve();
    await service.submitDecision({ ...REQUEST, decision: 'ACCEPT' });
    await pending;

    publish.mockClear();
    abandon();

    expect(publish).not.toHaveBeenCalled();
  });

  /**
   * AGI 가 재시도로 같은 제안을 다시 걸 수 있다. 앞선 연결이 끊겼다고 제안을 닫으면
   * 지금 기다리고 있는 재시도까지 같이 죽는다.
   */
  it('재시도가 넘겨받은 제안은 앞선 연결이 끊겨도 살려 둔다', async () => {
    const { service } = makeService();

    let abandonFirst = () => {};
    service.waitForDecision(REQUEST, (hook) => { abandonFirst = hook; });
    await Promise.resolve();

    const retry = service.waitForDecision(REQUEST, () => {});
    await Promise.resolve();

    abandonFirst();

    expect(service.isPending(REQUEST.linkedid, REQUEST.extension)).toBe(true);

    await service.submitDecision({ ...REQUEST, decision: 'ACCEPT' });
    await expect(retry).resolves.toBe('ACCEPT');
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

/**
 * 현장에서 "한 자리는 남아 있는데 다른 자리는 일찍 꺼졌다" 는 신고가 들어와도,
 * 지금까지는 서버가 제안에 대해 아무 시각도 남기지 않아 확인할 방법이 없었다.
 * 자리마다 언제 열리고 언제·왜 닫혔는지가 로그에 있어야 그 신고를 가른다.
 */
describe('AgentOfferService 진단 로그', () => {
  afterEach(() => jest.useRealTimers());

  it('제안이 열린 시각과 닫힌 이유·경과를 남긴다', async () => {
    jest.useFakeTimers();
    const logs: string[] = [];
    const spy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((message: unknown) => { logs.push(String(message)); });

    try {
      const { service } = makeService();
      const pending = service.waitForDecision(REQUEST);
      await Promise.resolve();

      expect(logs).toContainEqual(expect.stringContaining('1787355742.21:1001 opened timeout=10s'));

      jest.advanceTimersByTime(10_000);
      await pending;

      expect(logs).toContainEqual(
        expect.stringMatching(/1787355742\.21:1001 closed TIMEOUT after 10000ms/),
      );
    } finally {
      spy.mockRestore();
    }
  });
});

/**
 * 실제로 난 사고(2026-08-22 23:03). 고객이 큐에서 기다리다 끊었는데도 두 자리의
 * "받으시겠습니까?" 창이 **8초 더** 떠 있었다. 진 쪽 Local 채널은 이미 끊겼지만 AGI 는
 * `urlopen()` 안에 막혀 있어 롱폴 연결이 살아 있고, 그래서 서버는 대기 시간을 다 채운
 * 뒤에야 TIMEOUT 으로 닫았다.
 *
 * PBX 신호를 기다릴 일이 아니다 — **호가 끝났다는 사실은 우리가 이미 알고 있다.**
 * 그 사이 상담원이 수락을 누르면 이미 없는 전화를 받는다.
 */
describe('AgentOfferService 호 종료', () => {
  it('고객이 끊으면 그 호로 물어본 제안을 모두 닫는다', async () => {
    const { service } = makeService();

    const first = service.waitForDecision(REQUEST);
    const second = service.waitForDecision({ ...REQUEST, extension: '1002' });
    await Promise.resolve();

    await service.notifyCallEnded('tenant-1', REQUEST.linkedid);

    await expect(first).resolves.toBe('ABANDONED');
    await expect(second).resolves.toBe('ABANDONED');
  });

  it('다른 호의 제안은 건드리지 않는다', async () => {
    const { service } = makeService();

    const other = service.waitForDecision({ ...REQUEST, linkedid: '1787355742.99' });
    await Promise.resolve();

    await service.notifyCallEnded('tenant-1', REQUEST.linkedid);

    expect(service.isPending('1787355742.99', '1001')).toBe(true);
    await service.submitDecision({ ...REQUEST, linkedid: '1787355742.99', decision: 'ACCEPT' });
    await expect(other).resolves.toBe('ACCEPT');
  });
});

/**
 * 큐는 아무도 안 받으면 `retry` 만큼 쉬었다가 같은 자리를 다시 부른다. 그대로 두면
 * 상담원 화면에 "받으시겠습니까?" 가 꺼졌다 켜졌다를 고객이 끊을 때까지 되풀이한다.
 *
 * 한 호는 한 자리에 **한 번만** 묻는다. 그 뒤로 그 호는 대기 목록에만 보이고,
 * 받을 사람은 거기서 당겨받는다.
 */
describe('AgentOfferService 재요청', () => {
  afterEach(() => jest.useRealTimers());

  it('같은 호를 같은 자리에 다시 물어보지 않고 앞 결정을 그대로 돌려준다', async () => {
    jest.useFakeTimers();
    const { service, publish } = makeService();

    const first = service.waitForDecision(REQUEST);
    await Promise.resolve();
    jest.advanceTimersByTime(10_000);
    await expect(first).resolves.toBe('TIMEOUT');

    publish.mockClear();
    await expect(service.waitForDecision(REQUEST)).resolves.toBe('TIMEOUT');

    expect(publish).not.toHaveBeenCalledWith(AGENT_OFFER_EVENT, expect.anything(), expect.anything());
  });

  it('다른 자리는 그대로 물어본다', async () => {
    jest.useFakeTimers();
    const { service, publish } = makeService();

    const first = service.waitForDecision(REQUEST);
    await Promise.resolve();
    jest.advanceTimersByTime(10_000);
    await first;

    publish.mockClear();
    service.waitForDecision({ ...REQUEST, extension: '1002' });
    await Promise.resolve();

    expect(publish).toHaveBeenCalledWith(
      AGENT_OFFER_EVENT,
      expect.objectContaining({ extension: '1002' }),
      'tenant-1',
    );

    // 열어 둔 제안의 타이머를 남기지 않는다.
    await service.notifyCallEnded('tenant-1', REQUEST.linkedid);
  });

  /** 받은 자리는 막지 않는다. 기억을 근거로 수락을 되풀이하면 없는 전화를 다시 연결한다. */
  it('수락했던 자리는 기억으로 막지 않는다', async () => {
    const { service, publish } = makeService();

    const first = service.waitForDecision(REQUEST);
    await Promise.resolve();
    await service.submitDecision({ ...REQUEST, decision: 'ACCEPT' });
    await first;

    publish.mockClear();
    service.waitForDecision(REQUEST);
    await Promise.resolve();

    expect(publish).toHaveBeenCalledWith(AGENT_OFFER_EVENT, expect.anything(), 'tenant-1');

    await service.notifyCallEnded('tenant-1', REQUEST.linkedid);
  });

  it('호가 끝나면 그 호에 대한 기억도 지운다', async () => {
    jest.useFakeTimers();
    const { service, publish } = makeService();

    const first = service.waitForDecision(REQUEST);
    await Promise.resolve();
    jest.advanceTimersByTime(10_000);
    await first;

    await service.notifyCallEnded('tenant-1', REQUEST.linkedid);

    publish.mockClear();
    service.waitForDecision(REQUEST);
    await Promise.resolve();

    expect(publish).toHaveBeenCalledWith(AGENT_OFFER_EVENT, expect.anything(), 'tenant-1');

    await service.notifyCallEnded('tenant-1', REQUEST.linkedid);
  });
});
