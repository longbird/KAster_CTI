import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  MAX_AGENT_OFFER_TIMEOUT_SECONDS,
  MIN_AGENT_OFFER_TIMEOUT_SECONDS,
} from '../src/common/call-routing.constants';
import { AgentOfferWaitDto } from '../src/modules/calls/dto/agent-offer-wait.dto';
import { UpdateQueueDto } from '../src/modules/queues/dto/update-queue.dto';
import { renderDialplan } from '../src/modules/asterisk-config/renderers/dialplan.renderer';

/**
 * dialplan 에 실제로 박힌 값을 그대로 읽는다.
 * 렌더러가 무엇을 내보냈다고 주장하는지가 아니라, PBX 가 무엇을 들고 서버를 부를지가 중요하다.
 */
function readRenderedTimeoutSeconds(agentOfferTimeoutSeconds: number): number {
  const { extensionsQueue } = renderDialplan({
    dids: [],
    ivrMenus: [],
    queueOfferTimeouts: [{ queueName: 'sales', agentOfferTimeoutSeconds }],
  });

  const match = extensionsQueue.match(/exten => sales,1,Set\(__KASTER_OFFER_TIMEOUT=(\d+)\)/);
  if (!match) {
    throw new Error('agent-offer-timeout 줄을 찾지 못했습니다');
  }
  return Number(match[1]);
}

function validateWaitDto(timeoutSeconds: number) {
  return validateSync(plainToInstance(AgentOfferWaitDto, {
    linkedid: 'linked-1',
    extension: '1001',
    timeoutSeconds,
  }));
}

function validateQueueDto(agentOfferTimeoutSeconds: number) {
  return validateSync(plainToInstance(UpdateQueueDto, { agentOfferTimeoutSeconds }));
}

/**
 * 이 테스트가 지키는 사고:
 *
 * 호분배룰 입력 범위와 롱폴 DTO 범위가 갈리면, 관리자가 저장한 값이 dialplan → AGI 를 타고
 * 서버에 도착했을 때 400 으로 거부된다. AGI 는 예외를 만나면 ACCEPT 로 fail-open 하므로
 * **전 상담원이 묻지도 않고 자동 수락**되고, 수락/거절 기능이 통째로 무력화된다.
 * 증상은 "잘 되는 것처럼 보이는" 쪽이라 한참 뒤에야 발견된다.
 */
describe('상담원 제안 대기 시간 — 호분배룰 입력과 롱폴 검증 범위 계약', () => {
  it('호분배룰 최대값으로 렌더된 값이 롱폴 DTO 검증을 통과한다', () => {
    const rendered = readRenderedTimeoutSeconds(MAX_AGENT_OFFER_TIMEOUT_SECONDS);

    expect(validateQueueDto(MAX_AGENT_OFFER_TIMEOUT_SECONDS)).toHaveLength(0);
    expect(rendered).toBe(MAX_AGENT_OFFER_TIMEOUT_SECONDS);
    expect(validateWaitDto(rendered)).toHaveLength(0);
  });

  it('호분배룰 최소값으로 렌더된 값이 롱폴 DTO 검증을 통과한다', () => {
    const rendered = readRenderedTimeoutSeconds(MIN_AGENT_OFFER_TIMEOUT_SECONDS);

    expect(validateQueueDto(MIN_AGENT_OFFER_TIMEOUT_SECONDS)).toHaveLength(0);
    expect(rendered).toBe(MIN_AGENT_OFFER_TIMEOUT_SECONDS);
    expect(validateWaitDto(rendered)).toHaveLength(0);
  });

  it('관리자는 범위 밖 대기 시간을 저장할 수 없다', () => {
    expect(validateQueueDto(MAX_AGENT_OFFER_TIMEOUT_SECONDS + 1).length).toBeGreaterThan(0);
    expect(validateQueueDto(MIN_AGENT_OFFER_TIMEOUT_SECONDS - 1).length).toBeGreaterThan(0);
  });

  /**
   * DB 에 범위 밖 값이 남아 있어도(마이그레이션 이전 행, DB 직접 수정) 렌더러가 깎아서
   * 내보내므로 AGI 가 400 을 받지 않는다.
   */
  it('DB 에 범위 밖 값이 있어도 렌더된 값은 롱폴 DTO 검증을 통과한다', () => {
    for (const rawValue of [0, -5, 90, 3600]) {
      expect(validateWaitDto(readRenderedTimeoutSeconds(rawValue))).toHaveLength(0);
    }
  });
});
