import { classifyLeg, getAgentExtensionFromChannel, getChannelEndpointName } from './call-leg.util';

describe('getChannelEndpointName', () => {
  it('strips the channel suffix Asterisk appends', () => {
    expect(getChannelEndpointName('PJSIP/1001-0000001b')).toBe('1001');
  });

  // 트렁크 이름 자체에 하이픈이 들어간다. 첫 하이픈에서 자르면 이름이 잘려 나간다.
  it('keeps hyphens that belong to the endpoint name', () => {
    expect(getChannelEndpointName('PJSIP/trunk-070-5234-6380-00000021'))
      .toBe('trunk-070-5234-6380');
  });

  it('accepts a channel with no suffix', () => {
    expect(getChannelEndpointName('PJSIP/1001')).toBe('1001');
  });

  it.each([null, undefined, '', '   ', 'PJSIP/', 'nonsense'])(
    'returns null for %p rather than guessing',
    (value) => {
      expect(getChannelEndpointName(value as string | null)).toBeNull();
    },
  );
});

describe('getAgentExtensionFromChannel', () => {
  it('reads the extension from a device channel', () => {
    expect(getAgentExtensionFromChannel('PJSIP/1001-0000001b')).toBe('1001');
  });

  // Local 채널은 내선 뒤에 @context 가 붙는다. 이걸 못 벗기면 상담원 매칭이 실패해
  // callSessions.primaryAgentId 가 비고, 통화 이력과 통계가 통째로 빈다.
  it('reads the extension from a queue routing channel', () => {
    expect(getAgentExtensionFromChannel('Local/1001@agent-offer-00000007;1')).toBe('1001');
    expect(getAgentExtensionFromChannel('Local/1001@agent-offer')).toBe('1001');
  });

  it('reads the extension from a bare queue member interface', () => {
    expect(getAgentExtensionFromChannel('PJSIP/1001')).toBe('1001');
    expect(getAgentExtensionFromChannel('Local/1001@agent-offer')).toBe('1001');
  });

  it('has nothing to give for a carrier channel', () => {
    expect(getAgentExtensionFromChannel('PJSIP/trunk-070-5234-6380-00000021')).toBeNull();
  });
});

describe('classifyLeg', () => {
  it('reads an agent extension as the agent leg', () => {
    expect(classifyLeg('PJSIP/1001-0000001b')).toBe('agent');
  });

  // 'inbound' 는 당겨받기가 고객 leg 를 찾을 때 쓰는 값이다. 'trunk' 로 쓰면 못 찾는다.
  it('reads a carrier channel as the customer leg the pickup lookup expects', () => {
    expect(classifyLeg('PJSIP/trunk-070-5234-6380-00000021')).toBe('inbound');
  });

  // 판단이 안 되면 상담원으로 보지 않는다. 잘못 잡으면 통화 중인 다리를 끊는다.
  /**
   * 큐 멤버를 Local/{ext}@agent-offer 로 바꾸면 통화마다 Local 채널 두 가닥(;1 ;2)이
   * 더 생긴다. 이름이 내선으로 시작하니 그대로 두면 상담원 leg 로 잡히고,
   * 마이크 끄기·끊기가 실제 전화기가 아니라 그 중간 다리를 건드리게 된다.
   * 겉으로는 "됐다" 고 나오고 전화기는 그대로인, 찾기 어려운 고장이 된다.
   */
  it('does not mistake the queue routing channel for the agent device', () => {
    expect(classifyLeg('Local/1001@agent-offer-00000007;1')).toBe('local');
    expect(classifyLeg('Local/1001@agent-offer-00000007;2')).toBe('local');
  });

  it('refuses to guess when the channel makes no sense', () => {
    expect(classifyLeg('nonsense')).toBeNull();
    expect(classifyLeg(null)).toBeNull();
  });
});
