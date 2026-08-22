import { renderAgentDialplan } from './agent-dialplan.renderer';
import {
  AGENT_OFFER_TIMEOUT_VARIABLE,
  DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS,
} from '../../../common/call-routing.constants';

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

describe('renderAgentDialplan - agent-offer', () => {
  it('물어보고 나서 전화기를 울린다', () => {
    const rendered = renderAgentDialplan(OFFER_INPUT);

    expect(rendered).toContain('[agent-offer]');
    // 이름만 적으면 Asterisk 가 agi-bin 에서 찾는데 이 배포엔 그 디렉터리가 없다.
    // 못 찾아도 조용히 실패하고 fail-open 이라 확인 없이 다 통과한다.
    expect(rendered).toContain('AGI(/var/lib/asterisk/sounds/custom/kaster-agent-offer.agi,${EXTEN},');
    expect(rendered).toContain('Dial(PJSIP/${EXTEN},20,tTU(agent-pre-bridge))');
  });

  it('제안 사실과 결과를 CTI 로 올린다', () => {
    const rendered = renderAgentDialplan(OFFER_INPUT);

    expect(rendered).toContain('UserEvent(KasterAgentOffer,Stage: offered');
    expect(rendered).toContain('UserEvent(KasterAgentOffer,Stage: result');
  });

  /**
   * AGI 가 아예 못 돌면 KASTER_OFFER_RESULT 는 빈 문자열이다. 그때 거절로 보면
   * 모든 상담원이 통과되고 아무도 전화를 못 받는다 — 콜센터가 통째로 멈춘다.
   * 명시적인 REJECT/TIMEOUT 만 거절로 본다.
   */
  it('제안 절차가 고장나도 전화는 상담원에게 간다', () => {
    const rendered = renderAgentDialplan(OFFER_INPUT);
    const declineLine = rendered.split('\n').find((l) => l.includes('?declined'));

    expect(declineLine).toBeDefined();
    expect(declineLine).toContain('"REJECT"');
    expect(declineLine).toContain('"TIMEOUT"');
  });

  /**
   * Local/1001@agent-offer 의 device state 는 그 자체로는 알 수 없다. hint 가 없으면
   * 항상 "쓸 수 있음" 으로 보여 queues.conf 의 ringinuse=no 가 무력해지고,
   * 통화 중인 상담원에게 또 전화가 간다.
   */
  it('통화 중인 상담원을 큐가 알아볼 수 있게 hint 를 건다', () => {
    const rendered = renderAgentDialplan(OFFER_INPUT);

    expect(rendered).toContain('exten => 1001,hint,PJSIP/1001');
  });

  // REC_FILE 은 발신자 채널에서 물려받는다. 중간에 끊기면 MixMonitor 가 빈 이름으로
  // 녹취를 쓰려 하고, 그 통화 녹취가 통째로 사라진다.
  it('녹취 파일명이 비어 오면 여기서 채운다', () => {
    const rendered = renderAgentDialplan(OFFER_INPUT);
    const offerBlock = rendered.slice(rendered.indexOf('[agent-offer]'));

    expect(offerBlock).toContain('Set(__REC_FILE=');
  });

  /**
   * 대기 시간은 호분배룰(큐)마다 다르므로 여기에 박을 수 없다 — 이 context 는 모든 큐가 함께 쓴다.
   * 값은 큐 진입에서 채널에 실려 여기까지 따라온다 (`dialplan.renderer` 의 agent-offer-timeout).
   */
  it('대기 시간은 박아 두지 않고 호를 따라온 값을 쓴다', () => {
    const rendered = renderAgentDialplan(OFFER_INPUT);

    expect(rendered).toContain(
      `AGI(/var/lib/asterisk/sounds/custom/kaster-agent-offer.agi,\${EXTEN},\${${AGENT_OFFER_TIMEOUT_VARIABLE}})`,
    );
  });

  /**
   * 큐를 거치지 않고 이 context 로 들어오는 길이 있다(직접 Dial, 시험 호출). 그때 인자가 비면
   * AGI 가 롱폴 검증에 걸려 400 을 받고, AGI 는 실패하면 ACCEPT 로 연다 —
   * 전 상담원이 묻지도 않고 자동 수락된다.
   */
  it('따라온 값이 없으면 AGI 를 부르기 전에 기본값으로 채운다', () => {
    const rendered = renderAgentDialplan(OFFER_INPUT);
    const offerBlock = rendered.slice(rendered.indexOf('[agent-offer]'));

    const guard = offerBlock.indexOf(
      `Set(${AGENT_OFFER_TIMEOUT_VARIABLE}=${DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS})`,
    );
    expect(guard).toBeGreaterThan(-1);

    // 채우는 줄이 AGI 보다 뒤에 있으면 아무 소용이 없다.
    expect(guard).toBeLessThan(
      offerBlock.indexOf('AGI(/var/lib/asterisk/sounds/custom/kaster-agent-offer.agi'),
    );
  });

  // 범위 밖 값을 깎는 일은 이제 큐별로 값을 심는 쪽이 한다 — dialplan.renderer.spec 의
  // agent-offer-timeout 테스트를 본다.
});

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
        outboundDialPermissions: {
          phoneDirect: true,
          phoneDirectAllowedIps: ['203.0.113.10'],
          domestic: true,
          representative: true,
          paid: false,
          international: false,
        },
      }],
    });

    expect(rendered).toContain('Goto(outbound-main-1001,${EXTEN},1)');
    expect(rendered).toContain('GotoIf($["${PJSIP_DIAL_CONTACTS(1001)}"=""]?unregistered-agent,1)');
    expect(rendered).toContain('exten => unregistered-agent,1,NoOp(Registered contact not found for agent 1001)');
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

  it('스테레오 녹취 모드에서는 RAW 파일명과 MixMonitor D 옵션을 생성한다', () => {
    const rendered = renderAgentDialplan({
      allowDirectSipDial: true,
      defaultOutboundCallerId: '07052346380',
      allowedOutboundCallerIds: ['07052346380'],
      recordingChannelMode: 'STEREO_RAW',
      trunks: [{ name: 'Carrier Main', enabled: true }],
      agents: [{
        extension: '1001',
        outboundEnabled: true,
        callerIdPrivacy: 'allowed_not_screened',
        liveRecordingEnabled: true,
      }],
    } as any);

    expect(rendered).toContain('Set(__REC_FILE=${STRFTIME(${EPOCH},,%Y/%m/%d)}/${CHANNEL(linkedid)}-${UNIQUEID}.raw)');
    expect(rendered).toContain('MixMonitor(${REC_BASE_DIR}/${REC_FILE},bD)');
    expect(rendered).not.toContain('MixMonitor(${REC_BASE_DIR}/${REC_FILE},b)');
  });

  it('전화기 직접 발신은 기본 차단하고 outbound-main 은 클라이언트 발신용으로 유지한다', () => {
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
    });

    expect(rendered).toContain('exten => _00.,1,NoOp(Blocked outbound dial agent 1001 / ${EXTEN})');
    expect(rendered).toContain('exten => _060XXXXXXX,1,NoOp(Blocked outbound dial outbound-main 1001 / ${EXTEN})');
    expect(rendered).not.toContain('exten => _15XXXXXX,1,NoOp(Blocked outbound dial outbound-main 1001 / ${EXTEN})');
    expect(rendered).toContain('NoOp(Phone direct outbound disabled for agent 1001)');
    expect(rendered).not.toContain('Goto(outbound-main-1001,${EXTEN},1)');
    expect(rendered).toContain('exten => _15XXXXXX,1,NoOp(Outbound representative ${EXTEN})');
  });

  it('상담원 권한에서 대표번호를 끄면 PBX direct dial 도 대표번호를 차단한다', () => {
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
        outboundDialPermissions: {
          phoneDirect: true,
          phoneDirectAllowedIps: ['203.0.113.10'],
          domestic: true,
          representative: false,
          paid: false,
          international: false,
        },
      }],
    });

    expect(rendered).toContain('exten => _15XXXXXX,1,NoOp(Blocked outbound dial agent 1001 / ${EXTEN})');
    expect(rendered).toContain('exten => _16XXXXXX,1,NoOp(Blocked outbound dial outbound-main 1001 / ${EXTEN})');
  });

  it('기본 국선 그룹이 있으면 우선순위 순서의 회선 풀로 아웃바운드를 생성한다', () => {
    const rendered = renderAgentDialplan({
      allowDirectSipDial: true,
      defaultOutboundCallerId: '07052346380',
      allowedOutboundCallerIds: ['07052346380'],
      trunks: [
        { id: 'trunk-a', name: 'Carrier Main', enabled: true },
        { id: 'trunk-b', name: 'Carrier Backup', enabled: true },
      ],
      trunkGroups: [
        {
          enabled: true,
          isDefault: true,
          strategy: 'PRIORITY',
          members: [
            { priority: 200, enabled: true, trunk: { id: 'trunk-b', name: 'Carrier Backup', enabled: true } },
            { priority: 100, enabled: true, trunk: { id: 'trunk-a', name: 'Carrier Main', enabled: true } },
          ],
        },
      ],
      agents: [{
        extension: '1001',
        outboundEnabled: true,
        callerIdPrivacy: 'allowed_not_screened',
        liveRecordingEnabled: false,
      }],
    });

    expect(rendered).toContain(
      'Dial(PJSIP/${EXTEN}@trunk-carrier-main&PJSIP/${EXTEN}@trunk-carrier-backup,60',
    );
  });

  it('단축 발신은 상담원 컨텍스트에서 실제 대상번호로 라우팅한다', () => {
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
        outboundDialPermissions: {
          phoneDirect: true,
          phoneDirectAllowedIps: ['203.0.113.10'],
          domestic: true,
          representative: true,
          paid: false,
          international: false,
        },
      }],
      speedDials: [
        { code: '*01', targetNumber: '01012345678', displayName: '긴급 연락처', enabled: true },
        { code: '*02', targetNumber: '1002', displayName: '옆자리', enabled: true },
      ],
    });

    expect(rendered).toContain('exten => *01,1,NoOp(Speed dial *01 -> 긴급 연락처)');
    expect(rendered).toContain('Goto(outbound-main-1001,01012345678,1)');
    expect(rendered).toContain('exten => *02,1,NoOp(Speed dial *02 -> 옆자리)');
    expect(rendered).toContain('Dial(PJSIP/1002,20,tTU(agent-pre-bridge))');
  });

  describe('기능코드', () => {
    const agent = {
      extension: '1001',
      outboundEnabled: true,
      callerIdPrivacy: 'allowed_not_screened' as const,
      liveRecordingEnabled: false,
    };
    const base = {
      allowDirectSipDial: true,
      defaultOutboundCallerId: '07052346380',
      allowedOutboundCallerIds: ['07052346380'],
      trunks: [{ name: 'Carrier Main', enabled: true }],
      agents: [agent],
    };

    it('대리응답 코드는 네이티브 Pickup() 으로 렌더링한다', () => {
      // pjsip.renderer 가 이미 named_pickup_group 을 내보내므로 대상 선택은
      // PBX 가 한다. 서버 훅이 필요 없다.
      const rendered = renderAgentDialplan({
        ...base,
        featureCodes: [{ featureKey: 'pickup', code: '*8', enabled: true }],
      });

      expect(rendered).toContain('exten => *8,1,NoOp(Feature code pickup / agent 1001)');
      expect(rendered).toContain(' same => n,Pickup()');
    });

    it('서버 발신 DTMF 기능은 dialplan 에 렌더링하지 않는다', () => {
      // hold/resume/상담전환완료 는 서버가 PBX 로 보내는 DTMF 다.
      // 단말 다이얼로 열면 CTI 세션 상태와 어긋난다.
      const rendered = renderAgentDialplan({
        ...base,
        featureCodes: [
          { featureKey: 'hold', code: '*71', enabled: true },
          { featureKey: 'resume', code: '*72', enabled: true },
          { featureKey: 'attendedTransferComplete', code: '*2', enabled: true },
        ],
      });

      expect(rendered).not.toContain('exten => *71,');
      expect(rendered).not.toContain('exten => *72,');
      expect(rendered).not.toContain('exten => *2,');
    });

    it('비활성이거나 코드가 없으면 렌더링하지 않는다', () => {
      const rendered = renderAgentDialplan({
        ...base,
        featureCodes: [
          { featureKey: 'pickup', code: '*8', enabled: false },
        ],
      });

      expect(rendered).not.toContain('Pickup()');
    });

    it('카탈로그에 없는 키는 무시한다', () => {
      const rendered = renderAgentDialplan({
        ...base,
        featureCodes: [{ featureKey: '알수없는기능', code: '*9', enabled: true }],
      });

      expect(rendered).not.toContain('exten => *9,');
    });

    it('전체 잠금 상담원에게는 기능코드를 열지 않는다', () => {
      const rendered = renderAgentDialplan({
        ...base,
        agents: [{ ...agent, extensionLockMode: 'FULL_LOCKED' as const }],
        featureCodes: [{ featureKey: 'pickup', code: '*8', enabled: true }],
      });

      expect(rendered).not.toContain('Pickup()');
    });

    it('코드에 개행이 섞이면 렌더링을 거부한다', () => {
      expect(() => renderAgentDialplan({
        ...base,
        featureCodes: [{ featureKey: 'pickup', code: '*8\nexten => evil,1,Hangup()', enabled: true }],
      })).toThrow('illegal newline');
    });
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
