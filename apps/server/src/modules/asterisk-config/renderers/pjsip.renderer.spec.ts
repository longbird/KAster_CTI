import { renderPjsip } from './pjsip.renderer';

describe('renderPjsip', () => {
  it('renders global and transport sections', () => {
    const result = renderPjsip({ trunks: [], agents: [] });
    expect(result).toContain('[global]');
    expect(result).toContain('[transport-udp]');
  });

  it('renders enabled trunk sections', () => {
    const result = renderPjsip({
      trunks: [{
        id: 'u1', name: 'KT 회선 1', host: '1.2.3.4', port: 5060,
        username: 'trunk01', password: 's3cret', fromDomain: '1.2.3.4',
        codecs: 'alaw,ulaw', enabled: true,
      }],
      agents: [],
    });
    expect(result).toContain('[trunk-kt-1-auth]');
    expect(result).toContain('username=trunk01');
    expect(result).toContain('contact=sip:1.2.3.4:5060');
    expect(result).toContain('allow=alaw,ulaw');
  });

  it('skips disabled trunks', () => {
    const result = renderPjsip({
      trunks: [{ id: 'x', name: 'Off', host: '1.1.1.1', port: 5060,
        username: 'u', password: 'p', fromDomain: 'd', codecs: 'alaw', enabled: false }],
      agents: [],
    });
    expect(result).not.toContain('[trunk-');
  });

  it('renders agent endpoint for agent with sipPassword', () => {
    const result = renderPjsip({
      trunks: [],
      agents: [{ agentId: 'a1', extension: '1001', agentName: 'Agent1', sipPassword: 'sip123' }],
    });
    expect(result).toContain('[1001-auth]');
    expect(result).toContain('password=sip123');
    expect(result).toContain('[1001]');
    expect(result).toContain('callerid=Agent1 <1001>');
  });

  it('skips agents without sipPassword', () => {
    const result = renderPjsip({
      trunks: [],
      agents: [{ agentId: 'a2', extension: '1002', agentName: 'Agent2', sipPassword: null }],
    });
    expect(result).not.toContain('[1002]');
  });
});
