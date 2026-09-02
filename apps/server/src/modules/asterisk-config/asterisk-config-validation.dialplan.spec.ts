import { validateRenderedConfFiles } from './asterisk-config-validation';

function files(overrides: Record<string, string> = {}) {
  return {
    pjsip: '[global]\ntype=global\n',
    rtp: '[general]\nrtpstart=10000\n',
    extensionsInbound: '[inbound-main]\nexten => s,1,NoOp()\n',
    extensionsQueue: '[queue-entry]\nexten => s,1,NoOp()\n',
    extensionsAgent: '[from-queue]\nexten => s,1,NoOp()\n',
    queues: '[sales]\nstrategy=ringall\n',
    ...overrides,
  } as any;
}

function checkFor(result: ReturnType<typeof validateRenderedConfFiles>, fileName: string) {
  return result.checks.find((c) => c.name === `${fileName} has no unresolved placeholders`);
}

describe('렌더 결과 검증 — dialplan 변수 오탐', () => {
  /**
   * `${EXTEN}` 은 Asterisk 의 정상 문법이다. 이걸 "미해결 placeholder" 로 잡으면
   * dialplan 파일은 영원히 검증 실패가 되고, 그 패널은 아무도 안 보게 된다.
   */
  it('dialplan 파일의 Asterisk 변수는 실패로 잡지 않는다', () => {
    const result = validateRenderedConfFiles(files({
      extensionsInbound: '[inbound-main]\nexten => s,1,NoOp(${EXTEN})\n same => n,Set(__X=${CALLERID(num)})\n',
      extensionsQueue: '[queue-entry]\nexten => s,1,Goto(${QUEUE_NAME})\n',
      extensionsAgent: '[from-queue]\nexten => s,1,Dial(${AGENT})\n',
    }));

    expect(checkFor(result, 'extensions_inbound.conf')?.status).toBe('pass');
    expect(checkFor(result, 'extensions_queue.conf')?.status).toBe('pass');
    expect(checkFor(result, 'extensions_agent.conf')?.status).toBe('pass');
    expect(result.ok).toBe(true);
  });

  // dialplan 이 아닌 파일에는 변수가 들어갈 이유가 없다. 있으면 렌더가 덜 된 것이다.
  it('pjsip·rtp·queues 에 남은 placeholder 는 여전히 실패로 잡는다', () => {
    expect(checkFor(validateRenderedConfFiles(files({ pjsip: '[global]\nx=${TODO}\n' })), 'pjsip.conf')?.status)
      .toBe('fail');
    expect(checkFor(validateRenderedConfFiles(files({ rtp: '[general]\nx=${TODO}\n' })), 'rtp.conf')?.status)
      .toBe('fail');
    expect(checkFor(validateRenderedConfFiles(files({ queues: '[sales]\nx=${TODO}\n' })), 'queues.conf')?.status)
      .toBe('fail');
  });

  it('기존 검사(빈 내용·필수 컨텍스트)는 그대로 동작한다', () => {
    const empty = validateRenderedConfFiles(files({ extensionsInbound: '' }));
    expect(empty.ok).toBe(false);

    const noContext = validateRenderedConfFiles(files({ extensionsInbound: 'exten => s,1,NoOp()\n' }));
    expect(noContext.checks.find((c) => c.name.includes('contains [inbound-main]'))?.status).toBe('fail');
  });
});
