import { classifyDidInboundRoute } from './branch-did-route';

describe('classifyDidInboundRoute', () => {
  it('착신전환 규칙이 있으면 FORWARDING (다른 경로보다 우선)', () => {
    expect(
      classifyDidInboundRoute({ ivrMenuId: 'ivr-1', directQueue: 'sales', hasForwardingRule: true }),
    ).toBe('FORWARDING');
  });

  it('ivrMenuId 가 있으면 ARS', () => {
    expect(
      classifyDidInboundRoute({ ivrMenuId: 'ivr-1', directQueue: null, hasForwardingRule: false }),
    ).toBe('ARS');
  });

  it('directQueue 만 있으면 DIRECT_QUEUE', () => {
    expect(
      classifyDidInboundRoute({ ivrMenuId: null, directQueue: 'sales', hasForwardingRule: false }),
    ).toBe('DIRECT_QUEUE');
  });

  it('아무 경로도 없으면 NONE', () => {
    expect(
      classifyDidInboundRoute({ ivrMenuId: null, directQueue: null, hasForwardingRule: false }),
    ).toBe('NONE');
  });
});
