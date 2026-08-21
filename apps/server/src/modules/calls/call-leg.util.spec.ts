import { classifyLeg, getChannelEndpointName } from './call-leg.util';

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

describe('classifyLeg', () => {
  it('reads an agent extension as the agent leg', () => {
    expect(classifyLeg('PJSIP/1001-0000001b')).toBe('agent');
  });

  it('reads a carrier channel as the trunk leg', () => {
    expect(classifyLeg('PJSIP/trunk-070-5234-6380-00000021')).toBe('trunk');
  });

  // 판단이 안 되면 상담원으로 보지 않는다. 잘못 잡으면 통화 중인 다리를 끊는다.
  it('refuses to guess when the channel makes no sense', () => {
    expect(classifyLeg('nonsense')).toBeNull();
    expect(classifyLeg(null)).toBeNull();
  });
});
