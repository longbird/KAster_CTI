import { renderAgentDialplan } from './agent-dialplan.renderer';

describe('renderAgentDialplan', () => {
  it('직접 SIP 발신이 꺼져 있으면 agent-phone 에서 즉시 차단한다', () => {
    const rendered = renderAgentDialplan({
      allowDirectSipDial: false,
      defaultOutboundCallerId: '07052346380',
      allowedOutboundCallerIds: ['07052346380'],
      trunks: [{ name: 'Test Trunk', enabled: true }],
    });

    expect(rendered).toContain('[agent-phone]');
    expect(rendered).toContain('Playback(ss-noservice)');
    expect(rendered).not.toContain('Goto(phone-outbound-main,${EXTEN},1)');
  });

  it('발신 허용 시 기본 발신번호와 첫 활성 트렁크로 아웃바운드를 생성한다', () => {
    const rendered = renderAgentDialplan({
      allowDirectSipDial: true,
      defaultOutboundCallerId: '07052346380',
      allowedOutboundCallerIds: ['07052346380', '07052346381'],
      trunks: [{ name: 'Carrier Main', enabled: true }],
    });

    expect(rendered).toContain('Goto(phone-outbound-main,${EXTEN},1)');
    expect(rendered).toContain('Set(CALLERID(num)=07052346380)');
    expect(rendered).toContain('Dial(PJSIP/${EXTEN}@trunk-carrier-main,60');
  });
});
