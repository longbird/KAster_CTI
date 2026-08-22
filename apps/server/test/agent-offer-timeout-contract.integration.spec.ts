import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  MAX_AGENT_OFFER_TIMEOUT_SECONDS,
  MIN_AGENT_OFFER_TIMEOUT_SECONDS,
} from '../src/common/call-routing.constants';
import { AgentOfferWaitDto } from '../src/modules/calls/dto/agent-offer-wait.dto';
import { UpdateSystemSettingsDto } from '../src/modules/admin/dto/update-system-settings.dto';
import { renderAgentDialplan } from '../src/modules/asterisk-config/renderers/agent-dialplan.renderer';

const OFFER_INPUT = {
  allowDirectSipDial: true,
  defaultOutboundCallerId: '07052346380',
  allowedOutboundCallerIds: ['07052346380'],
  trunks: [{ name: 'Test Trunk', enabled: true }],
  agents: [{
    extension: '1001',
    outboundEnabled: true,
    callerIdPrivacy: 'allowed_not_screened' as const,
    liveRecordingEnabled: true,
  }],
};

/**
 * dialplan 에 실제로 박힌 AGI 두 번째 인자를 그대로 읽는다.
 * 렌더러가 무엇을 내보냈는지가 아니라 PBX 가 무엇을 들고 서버를 부를지가 중요하다.
 */
function readRenderedAgiTimeoutSeconds(offerTimeoutSeconds: number): number {
  const rendered = renderAgentDialplan({ ...OFFER_INPUT, offerTimeoutSeconds });
  const match = rendered.match(/AGI\([^,]+,\$\{EXTEN\},(\d+)\)/);
  if (!match) {
    throw new Error('agent-offer AGI 줄을 찾지 못했습니다');
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

function validateSystemSettingsDto(agentOfferTimeoutSeconds: number) {
  return validateSync(plainToInstance(UpdateSystemSettingsDto, {
    recordingEnabled: true,
    defaultMaxWaitSeconds: 45,
    allowDirectSipDial: false,
    sipRegisterPort: 48950,
    timezone: 'Asia/Seoul',
    dateFormat: 'YYYY-MM-DD HH:mm:ss',
    agentOfferTimeoutSeconds,
  }));
}

/**
 * 이 테스트가 지키는 사고:
 *
 * 관리자 입력 범위와 롱폴 DTO 범위가 갈리면, 관리자가 저장한 값이 dialplan → AGI 를 타고
 * 서버에 도착했을 때 400 으로 거부된다. AGI 는 예외를 만나면 ACCEPT 로 fail-open 하므로
 * **전 상담원이 묻지도 않고 자동 수락**되고, 수락/거절 기능이 통째로 무력화된다.
 * 증상은 "잘 되는 것처럼 보이는" 쪽이라 한참 뒤에야 발견된다.
 */
describe('상담원 제안 대기 시간 — 관리자 입력과 롱폴 검증 범위 계약', () => {
  it('관리자 설정 최대값으로 렌더된 dialplan 의 AGI 인자가 롱폴 DTO 검증을 통과한다', () => {
    const agiTimeout = readRenderedAgiTimeoutSeconds(MAX_AGENT_OFFER_TIMEOUT_SECONDS);

    expect(validateSystemSettingsDto(MAX_AGENT_OFFER_TIMEOUT_SECONDS)).toHaveLength(0);
    expect(agiTimeout).toBe(MAX_AGENT_OFFER_TIMEOUT_SECONDS);
    expect(validateWaitDto(agiTimeout)).toHaveLength(0);
  });

  it('관리자 설정 최소값으로 렌더된 dialplan 의 AGI 인자가 롱폴 DTO 검증을 통과한다', () => {
    const agiTimeout = readRenderedAgiTimeoutSeconds(MIN_AGENT_OFFER_TIMEOUT_SECONDS);

    expect(validateSystemSettingsDto(MIN_AGENT_OFFER_TIMEOUT_SECONDS)).toHaveLength(0);
    expect(agiTimeout).toBe(MIN_AGENT_OFFER_TIMEOUT_SECONDS);
    expect(validateWaitDto(agiTimeout)).toHaveLength(0);
  });

  it('관리자는 범위 밖 대기 시간을 저장할 수 없다', () => {
    expect(validateSystemSettingsDto(MAX_AGENT_OFFER_TIMEOUT_SECONDS + 1).length).toBeGreaterThan(0);
    expect(validateSystemSettingsDto(MIN_AGENT_OFFER_TIMEOUT_SECONDS - 1).length).toBeGreaterThan(0);
  });

  /**
   * DB 에 범위 밖 값이 남아 있어도(마이그레이션 이전 행, DB 직접 수정) 렌더러가 깎아서
   * 내보내므로 AGI 가 400 을 받지 않는다.
   */
  it('DB 에 범위 밖 값이 있어도 렌더된 AGI 인자는 롱폴 DTO 검증을 통과한다', () => {
    for (const rawValue of [0, -5, 90, 3600]) {
      const agiTimeout = readRenderedAgiTimeoutSeconds(rawValue);

      expect(validateWaitDto(agiTimeout)).toHaveLength(0);
    }
  });
});
