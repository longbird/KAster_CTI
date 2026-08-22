import { AsteriskManagerService } from './asterisk-manager.service';

function createManager() {
  const ami = { sendAction: jest.fn() };
  const service = new AsteriskManagerService(ami as any);
  return { service, ami };
}

describe('AsteriskManagerService DTMF', () => {
  it('sendDtmf 는 한 자리씩 PlayDTMF 로 내보낸다', () => {
    const { service, ami } = createManager();

    service.sendDtmf('PJSIP/1001-0000abcd', '1*#');

    expect(ami.sendAction).toHaveBeenCalledTimes(3);
    expect(ami.sendAction).toHaveBeenNthCalledWith(1, {
      Action: 'PlayDTMF',
      Channel: 'PJSIP/1001-0000abcd',
      Digit: '1',
      Receive: 'true',
    });
    expect(ami.sendAction).toHaveBeenNthCalledWith(2, expect.objectContaining({ Digit: '*' }));
    expect(ami.sendAction).toHaveBeenNthCalledWith(3, expect.objectContaining({ Digit: '#' }));
  });

  /**
   * AMI 는 \r\n 으로 필드를, 빈 줄로 액션을 구분한다. 개행이 값에 실리면
   * 임의 AMI 액션을 주입할 수 있다. HTTP DTO 검증은 REST 경로만 막으므로
   * AMI 로 나가는 마지막 지점에도 방어를 둔다.
   */
  it('sendDtmf 는 개행이 섞인 값을 프로토콜에 싣지 않는다', () => {
    const { service, ami } = createManager();

    expect(() => service.sendDtmf('PJSIP/1001-0000abcd', '1\r\nAction: Command')).toThrow();
    expect(ami.sendAction).not.toHaveBeenCalled();
  });

  it('sendDtmf 는 DTMF 가 아닌 문자를 거절한다', () => {
    const { service, ami } = createManager();

    expect(() => service.sendDtmf('PJSIP/1001-0000abcd', '12a')).toThrow();
    expect(() => service.sendDtmf('PJSIP/1001-0000abcd', '1 2')).toThrow();
    expect(() => service.sendDtmf('PJSIP/1001-0000abcd', '')).toThrow();
    expect(ami.sendAction).not.toHaveBeenCalled();
  });

  /**
   * 앞자리를 이미 보낸 뒤에 던지면 상대 ARS 에 반쪽짜리 입력이 남는다.
   */
  it('sendDtmf 는 뒷자리가 불량이면 앞자리도 보내지 않는다', () => {
    const { service, ami } = createManager();

    expect(() => service.sendDtmf('PJSIP/1001-0000abcd', '12;34')).toThrow();
    expect(ami.sendAction).not.toHaveBeenCalled();
  });

  it('sendFeatureCode 는 기존대로 공백을 걷어내고 내보낸다', () => {
    const { service, ami } = createManager();

    service.sendFeatureCode('PJSIP/1001-0000abcd', ' *5 5 ');

    expect(ami.sendAction).toHaveBeenCalledTimes(3);
    expect(ami.sendAction).toHaveBeenNthCalledWith(1, expect.objectContaining({ Digit: '*' }));
    expect(ami.sendAction).toHaveBeenNthCalledWith(2, expect.objectContaining({ Digit: '5' }));
  });

  it('sendFeatureCode 도 주입 문자를 거절한다', () => {
    const { service, ami } = createManager();

    expect(() => service.sendFeatureCode('PJSIP/1001-0000abcd', '*5\r\nAction: Command')).toThrow();
    expect(() => service.sendFeatureCode('PJSIP/1001-0000abcd', '   ')).toThrow();
    expect(ami.sendAction).not.toHaveBeenCalled();
  });
});
