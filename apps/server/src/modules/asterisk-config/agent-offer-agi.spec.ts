import { AGENT_OFFER_WAIT_PATH, buildAgentOfferAgiScript } from './agent-offer-agi';
import {
  DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS,
  MAX_AGENT_OFFER_TIMEOUT_SECONDS,
  MIN_AGENT_OFFER_TIMEOUT_SECONDS,
} from '../../common/call-routing.constants';

describe('buildAgentOfferAgiScript', () => {
  it('runs as python3 and answers the dialplan through KASTER_OFFER_RESULT', () => {
    const script = buildAgentOfferAgiScript(3000, 'secret');

    expect(script.startsWith('#!/usr/bin/env python3')).toBe(true);
    expect(script).toContain('SET VARIABLE KASTER_OFFER_RESULT');
  });

  it('calls the server on the port it was given', () => {
    const script = buildAgentOfferAgiScript(3100, 'secret');

    expect(script).toContain('PORT = 3100');
    expect(script).toContain(AGENT_OFFER_WAIT_PATH);
  });

  /**
   * 시크릿에 따옴표나 역슬래시가 섞여도 파이썬 리터럴이 깨지면 안 된다.
   * 깨지면 AGI 가 SyntaxError 로 죽고, 그때부터 모든 호가 확인 없이 흘러간다.
   */
  it('survives a secret with quotes in it', () => {
    const script = buildAgentOfferAgiScript(3000, 'a"b\\c');

    expect(script).toContain('SECRET = "a\\"b\\\\c"');
  });

  it('does not write the word None where a secret is missing', () => {
    const script = buildAgentOfferAgiScript(3000, null);

    expect(script).toContain('SECRET = ""');
  });

  /**
   * 서버가 죽었거나 네트워크가 막혔을 때 전부 거절로 처리하면 콜센터가 통째로 멈춘다.
   * 확인 절차가 고장난 것과 아무도 전화를 못 받는 것 중에서는 전자가 낫다.
   */
  it('falls open to ACCEPT when the server cannot be reached', () => {
    const script = buildAgentOfferAgiScript(3000, 'secret');
    const lines = script.split('\n');
    const exceptIndex = lines.findIndex((line) => line.trim().startsWith('except Exception'));

    expect(exceptIndex).toBeGreaterThan(-1);
    expect(lines[exceptIndex + 1]).toContain('result = "ACCEPT"');
  });

  it('waits longer than the server so a late accept is not thrown away', () => {
    const script = buildAgentOfferAgiScript(3000, 'secret');

    expect(script).toContain('timeout=timeout + 3');
  });

  /**
   * dialplan 인자가 서버가 받아주는 범위를 벗어나면 롱폴이 400 을 돌려주고,
   * AGI 는 예외를 만나 ACCEPT 로 fail-open 한다 — 전 상담원이 묻지도 않고 자동 수락된다.
   * 렌더러가 먼저 깎지만, 서버를 부르기 직전인 여기서도 같은 범위로 묶는다.
   */
  it('clamps the dialplan argument into the range the server accepts', () => {
    const script = buildAgentOfferAgiScript(3000, 'secret');

    expect(script).toContain(
      `timeout = min(${MAX_AGENT_OFFER_TIMEOUT_SECONDS}, max(${MIN_AGENT_OFFER_TIMEOUT_SECONDS}, int(env.get("agi_arg_2", "${DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS}") or "${DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS}")))`,
    );
    expect(script).toContain(`    timeout = ${DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS}`);
  });
});
