import { validateSync } from 'class-validator';
import { SendDtmfDto } from './send-dtmf.dto';

function validate(digits: unknown) {
  const dto = Object.assign(new SendDtmfDto(), { digits });

  return validateSync(dto).flatMap((error) => Object.keys(error.constraints ?? {}));
}

describe('SendDtmfDto', () => {
  it('ARS 에서 실제로 누르는 키를 통과시킨다', () => {
    expect(validate('1')).toEqual([]);
    expect(validate('0123456789')).toEqual([]);
    expect(validate('*0#')).toEqual([]);
  });

  /**
   * 이 값은 AMI 액션의 필드로 그대로 나간다. AMI 는 \r\n 으로 필드를 구분하므로
   * 개행이 섞이면 임의 AMI 액션(예: Originate, Command)을 주입할 수 있다.
   */
  it('개행이 섞인 값을 거절한다', () => {
    expect(validate('1\r\nAction: Command')).toContain('matches');
    expect(validate('1\nAction: Command')).toContain('matches');
    expect(validate('12\n')).toContain('matches');
  });

  it('DTMF 가 아닌 문자를 거절한다', () => {
    expect(validate('12a')).toContain('matches');
    expect(validate('1 2')).toContain('matches');
    expect(validate('+821012345678')).toContain('matches');
    expect(validate('1;2')).toContain('matches');
  });

  it('빈 값을 거절한다', () => {
    expect(validate('')).not.toEqual([]);
    expect(validate(undefined)).toContain('isString');
    expect(validate(123)).toContain('isString');
  });

  /**
   * 한 자리마다 AMI 액션이 하나씩 나가고 그동안 채널이 톤으로 붙잡힌다.
   * 상한이 없으면 한 번의 요청으로 통화를 임의 시간 동안 점유할 수 있다.
   */
  it('상한을 넘는 자릿수를 거절한다', () => {
    expect(validate('1'.repeat(32))).toEqual([]);
    expect(validate('1'.repeat(33))).toContain('maxLength');
  });
});
