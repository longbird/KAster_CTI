import { renderAgentDialplan } from './agent-dialplan.renderer';

describe('renderAgentDialplan', () => {
  it('직접 SIP 발신이 꺼져 있으면 agent-phone 에서 즉시 차단한다', () => {
    const rendered = renderAgentDialplan({
      allowDirectSipDial: false,
      defaultOutboundCallerId: '07052346380',
      allowedOutboundCallerIds: ['07052346380'],
      trunks: [{ name: 'Test Trunk', enabled: true }],
      agents: [{
        extension: '1001',
        outboundEnabled: true,
        callerIdPrivacy: 'allowed_not_screened',
        liveRecordingEnabled: true,
      }],
    });

    expect(rendered).toContain('[agent-phone-1001]');
    expect(rendered).toContain('Playback(ss-noservice)');
    expect(rendered).not.toContain('Goto(outbound-main-1001,${EXTEN},1)');
  });

  it('발신 허용 시 기본 발신번호와 첫 활성 트렁크로 아웃바운드를 생성한다', () => {
    const rendered = renderAgentDialplan({
      allowDirectSipDial: true,
      defaultOutboundCallerId: '07052346380',
      allowedOutboundCallerIds: ['07052346380', '07052346381'],
      trunks: [{ name: 'Carrier Main', enabled: true }],
      agents: [{
        extension: '1001',
        outboundEnabled: true,
        callerIdPrivacy: 'prohib',
        liveRecordingEnabled: true,
      }],
    });

    expect(rendered).toContain('Goto(outbound-main-1001,${EXTEN},1)');
    expect(rendered).toContain('exten => _[12]XXX,1,NoOp(Internal endpoint call 1001 / ${EXTEN})');
    expect(rendered).toContain('Dial(PJSIP/${EXTEN},20,tTU(agent-pre-bridge))');
    expect(rendered).toContain('Set(CALLERID(num)=07052346380)');
    expect(rendered).toContain('Set(CALLERID(pres)=prohib)');
    expect(rendered).toContain('Dial(PJSIP/${EXTEN}@trunk-carrier-main,60');
    expect(rendered).toContain('[func-set-sipheaders]');
    expect(rendered).toContain('Return()');
    expect(rendered).toContain('U(agent-pre-bridge)');
    expect(rendered).toContain('[agent-pre-bridge-1001]');
    expect(rendered).toContain('MixMonitor(${REC_BASE_DIR}/${REC_FILE},b)');
  });

  it('인바운드 전용 상담원은 외부 발신 컨텍스트에서 차단한다', () => {
    const rendered = renderAgentDialplan({
      allowDirectSipDial: true,
      defaultOutboundCallerId: '07052346380',
      allowedOutboundCallerIds: ['07052346380'],
      trunks: [{ name: 'Carrier Main', enabled: true }],
      agents: [{
        extension: '1002',
        outboundEnabled: false,
        callerIdPrivacy: 'allowed_not_screened',
        liveRecordingEnabled: false,
      }],
    });

    expect(rendered).toContain('[agent-phone-1002]');
    expect(rendered).toContain('Playback(ss-noservice)');
    expect(rendered).not.toContain('Goto(outbound-main-1002,${EXTEN},1)');
  });
});
