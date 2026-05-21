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

  it('내선 잠금 OUTBOUND_LOCKED 는 외부 발신만 차단하고 내부 통화는 유지한다', () => {
    const rendered = renderAgentDialplan({
      allowDirectSipDial: true,
      defaultOutboundCallerId: '07052346380',
      allowedOutboundCallerIds: ['07052346380'],
      trunks: [{ name: 'Carrier Main', enabled: true }],
      agents: [{
        extension: '1004',
        outboundEnabled: true,
        callerIdPrivacy: 'allowed_not_screened',
        liveRecordingEnabled: false,
        extensionLockMode: 'OUTBOUND_LOCKED',
      }],
    });

    expect(rendered).toContain('[agent-phone-1004]');
    expect(rendered).toContain('NoOp(Outbound disabled for agent 1004: OUTBOUND_LOCKED)');
    expect(rendered).not.toContain('Goto(outbound-main-1004,${EXTEN},1)');
    expect(rendered).toContain('exten => _[12]XXX,1,NoOp(Internal endpoint call 1004 / ${EXTEN})');
  });

  it('내선 잠금 FULL_LOCKED 는 외부 발신과 내부 통화를 모두 차단한다', () => {
    const rendered = renderAgentDialplan({
      allowDirectSipDial: true,
      defaultOutboundCallerId: '07052346380',
      allowedOutboundCallerIds: ['07052346380'],
      trunks: [{ name: 'Carrier Main', enabled: true }],
      agents: [{
        extension: '1005',
        outboundEnabled: true,
        callerIdPrivacy: 'allowed_not_screened',
        liveRecordingEnabled: false,
        extensionLockMode: 'FULL_LOCKED',
      }],
    });

    expect(rendered).toContain('NoOp(Agent endpoint 1005 is FULL_LOCKED)');
    expect(rendered).toContain('Playback(ss-noservice)');
    expect(rendered).not.toContain('Goto(outbound-main-1005,${EXTEN},1)');
    expect(rendered).not.toContain('Internal endpoint call 1005');
  });

  it('outbound caller-id rules — 룰이 없거나 모두 disabled 면 단일 callerId 인라인 Set 을 유지한다 (PR1-3B 회귀 가드)', () => {
    const rendered = renderAgentDialplan({
      allowDirectSipDial: true,
      defaultOutboundCallerId: '07052346380',
      allowedOutboundCallerIds: ['07052346380'],
      trunks: [{ name: 'Carrier Main', enabled: true }],
      agents: [{
        extension: '1001',
        outboundEnabled: true,
        callerIdPrivacy: 'allowed_not_screened',
        liveRecordingEnabled: false,
      }],
      outboundCallerIdRules: [],
    });

    expect(rendered).toContain('Set(CALLERID(num)=07052346380)');
    expect(rendered).not.toContain('Gosub(outbound-cid-rules');
    expect(rendered).not.toContain('[outbound-cid-rules]');
  });

  it('outbound caller-id rules — 룰이 있으면 outbound-cid-rules 컨텍스트로 Gosub 위임', () => {
    const rendered = renderAgentDialplan({
      allowDirectSipDial: true,
      defaultOutboundCallerId: '0299999999',
      allowedOutboundCallerIds: ['0299999999', '0212345678'],
      trunks: [{ name: 'Carrier Main', enabled: true }],
      agents: [{
        extension: '1001',
        outboundEnabled: true,
        callerIdPrivacy: 'allowed_not_screened',
        liveRecordingEnabled: false,
      }],
      outboundCallerIdRules: [
        {
          matchType: 'PREFIX',
          sourceNumberPattern: '010',
          callerIdNumber: '0212345678',
          displayName: '대표번호',
          priority: 100,
          enabled: true,
        },
        {
          matchType: 'EXACT',
          sourceNumberPattern: '0212340000',
          callerIdNumber: '0287654321',
          displayName: null,
          priority: 50,
          enabled: true,
        },
        {
          matchType: 'DIALPLAN_PATTERN',
          sourceNumberPattern: '_NXX',
          callerIdNumber: '0277777777',
          displayName: null,
          priority: 200,
          enabled: true,
        },
        {
          matchType: 'REGEX',
          sourceNumberPattern: '^999',
          callerIdNumber: '0288888888',
          displayName: null,
          priority: 300,
          enabled: true,
        },
        {
          matchType: 'PREFIX',
          sourceNumberPattern: '02',
          callerIdNumber: '0211111111',
          displayName: null,
          priority: 999,
          enabled: false, // disabled — 출력 안됨
        },
      ],
    });

    expect(rendered).toContain('[outbound-cid-rules]');
    // outbound-main 은 인라인 Set 대신 Gosub 사용
    expect(rendered).toContain('Gosub(outbound-cid-rules,${EXTEN},1)');
    expect(rendered).not.toContain('Set(CALLERID(num)=0299999999)\n same => n,Set(CALLERID(name)=0299999999)\n same => n,Set(CALLERID(pres)');

    // priority 50 (EXACT) 가 100 (PREFIX) 보다 먼저
    const idxExact = rendered.indexOf('exten => 0212340000,1,');
    const idxPrefix = rendered.indexOf('exten => _010.,1,');
    const idxDialplan = rendered.indexOf('exten => _NXX,1,');
    expect(idxExact).toBeGreaterThan(0);
    expect(idxPrefix).toBeGreaterThan(idxExact);
    expect(idxDialplan).toBeGreaterThan(idxPrefix);

    // PREFIX 룰이 _010. 으로 dialplan 패턴 변환
    expect(rendered).toContain('Set(CALLERID(num)=0212345678)');
    expect(rendered).toContain('Set(CALLERID(name)=대표번호)');

    // EXACT 룰
    expect(rendered).toContain('Set(CALLERID(num)=0287654321)');
    // displayName 이 없으면 callerIdNumber 그대로
    expect(rendered).toContain('Set(CALLERID(name)=0287654321)');

    // REGEX 는 NOTE 코멘트만
    expect(rendered).toContain('NOTE: REGEX rule prio=300');

    // disabled 룰은 출력되지 않음
    expect(rendered).not.toContain('0211111111');

    // fallback 컨텍스트
    expect(rendered).toContain('exten => _X.,1,NoOp(Outbound CID rule fallback)');
    expect(rendered).toContain('Set(CALLERID(num)=0299999999)'); // default fallback
  });

  it('outbound caller-id rules — 동일 dialplan exten 충돌 시 priority 작은 룰만 채택', () => {
    const rendered = renderAgentDialplan({
      allowDirectSipDial: true,
      defaultOutboundCallerId: '0299999999',
      allowedOutboundCallerIds: ['0299999999'],
      trunks: [{ name: 'Carrier Main', enabled: true }],
      agents: [{
        extension: '1001',
        outboundEnabled: true,
        callerIdPrivacy: 'allowed_not_screened',
        liveRecordingEnabled: false,
      }],
      outboundCallerIdRules: [
        {
          matchType: 'PREFIX',
          sourceNumberPattern: '010',
          callerIdNumber: '0211111111',
          displayName: null,
          priority: 200,
          enabled: true,
        },
        {
          matchType: 'PREFIX',
          sourceNumberPattern: '010',
          callerIdNumber: '0222222222',
          displayName: null,
          priority: 100, // 더 작은 priority — 채택됨
          enabled: true,
        },
      ],
    });

    expect(rendered).toContain('Set(CALLERID(num)=0222222222)');
    expect(rendered).not.toContain('Set(CALLERID(num)=0211111111)');
  });

  it('outbound caller-id rules — 지사 룰은 해당 지사 상담원 context 에만 반영', () => {
    const rendered = renderAgentDialplan({
      allowDirectSipDial: true,
      defaultOutboundCallerId: '0299999999',
      allowedOutboundCallerIds: ['0299999999', '0211111111', '0222222222'],
      trunks: [{ name: 'Carrier Main', enabled: true }],
      agents: [
        {
          extension: '1001',
          outboundEnabled: true,
          callerIdPrivacy: 'allowed_not_screened',
          liveRecordingEnabled: false,
          branchIds: ['branch-a'],
        },
        {
          extension: '1002',
          outboundEnabled: true,
          callerIdPrivacy: 'allowed_not_screened',
          liveRecordingEnabled: false,
          branchIds: ['branch-b'],
        },
      ],
      outboundCallerIdRules: [
        {
          matchType: 'PREFIX',
          sourceNumberPattern: '010',
          callerIdNumber: '0211111111',
          displayName: 'A지사',
          priority: 10,
          enabled: true,
          branchId: 'branch-a',
        },
        {
          matchType: 'PREFIX',
          sourceNumberPattern: '011',
          callerIdNumber: '0222222222',
          displayName: 'B지사',
          priority: 10,
          enabled: true,
          branchId: 'branch-b',
        },
      ],
    });

    expect(rendered).toContain('Gosub(outbound-cid-rules-1001,${EXTEN},1)');
    expect(rendered).toContain('Gosub(outbound-cid-rules-1002,${EXTEN},1)');

    const branchAContext = rendered.slice(
      rendered.indexOf('[outbound-cid-rules-1001]'),
      rendered.indexOf('[outbound-cid-rules-1002]'),
    );
    const branchBContext = rendered.slice(rendered.indexOf('[outbound-cid-rules-1002]'));

    expect(branchAContext).toContain('Set(CALLERID(num)=0211111111)');
    expect(branchAContext).not.toContain('0222222222');
    expect(branchBContext).toContain('Set(CALLERID(num)=0222222222)');
    expect(branchBContext).not.toContain('0211111111');
  });
});
