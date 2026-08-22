import { validateSync } from 'class-validator';
import { AgentOfferWaitDto } from './agent-offer-wait.dto';

function validate(timeoutSeconds: unknown) {
  const dto = Object.assign(new AgentOfferWaitDto(), {
    linkedid: '1787355742.21',
    extension: '1001',
    timeoutSeconds,
  });

  return validateSync(dto).flatMap((error) => Object.keys(error.constraints ?? {}));
}

describe('AgentOfferWaitDto', () => {
  it('상담원이 결정할 시간만큼은 기다린다', () => {
    expect(validate(10)).toEqual([]);
  });

  /**
   * 이 값은 서버 커넥션을 그 시간만큼 붙잡고, 그동안 발신자는 큐에 갇힌다.
   * 다이얼플랜이 큰 값을 보내도 서버가 상한을 지켜야 한다.
   */
  it('다이얼플랜이 보낸 대기 시간이 상한을 넘으면 거절한다', () => {
    expect(validate(600)).toContain('max');
  });

  it('0초나 음수는 거절한다', () => {
    expect(validate(0)).toContain('min');
    expect(validate(-5)).toContain('min');
  });
});
