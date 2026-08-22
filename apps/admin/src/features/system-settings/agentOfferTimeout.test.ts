import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AGENT_OFFER_TIMEOUT_MAX_SECONDS, AGENT_OFFER_TIMEOUT_MIN_SECONDS } from './agentOfferTimeout';

const SERVER_CONSTANTS_PATH = fileURLToPath(
  new URL('../../../../server/src/common/call-routing.constants.ts', import.meta.url),
);

function readServerConstant(name: string): number {
  const source = readFileSync(SERVER_CONSTANTS_PATH, 'utf8');
  const match = source.match(new RegExp(`export const ${name} = (\\d+);`));
  if (!match) {
    throw new Error(`서버 상수 ${name} 을 찾지 못했습니다: ${SERVER_CONSTANTS_PATH}`);
  }
  return Number(match[1]);
}

/**
 * 화면 입력 범위가 서버 범위보다 넓으면, 관리자가 저장한 값이 AGI 를 타고 서버에 도착했을 때
 * 거부되고 AGI 는 fail-open 으로 ACCEPT 한다 — 전 상담원이 묻지도 않고 자동 수락된다.
 */
describe('상담원 제안 대기 시간 입력 범위', () => {
  it('서버가 받아주는 범위와 같다', () => {
    expect(AGENT_OFFER_TIMEOUT_MIN_SECONDS).toBe(readServerConstant('MIN_AGENT_OFFER_TIMEOUT_SECONDS'));
    expect(AGENT_OFFER_TIMEOUT_MAX_SECONDS).toBe(readServerConstant('MAX_AGENT_OFFER_TIMEOUT_SECONDS'));
  });
});
