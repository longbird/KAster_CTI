import { renderPjsip } from './pjsip.renderer';

describe('renderPjsip', () => {
  it('renders global and transport sections', () => {
    const result = renderPjsip({ trunks: [], agents: [] });
    expect(result).toContain('[global]');
    expect(result).toContain('[transport-udp]');
    expect(result).toContain('bind=0.0.0.0:36070');
  });

  it('renders custom SIP register port from system settings', () => {
    const result = renderPjsip({ trunks: [], agents: [], sipRegisterPort: 36070 });
    expect(result).toContain('bind=0.0.0.0:36070');
  });

  it('renders enabled trunk sections', () => {
    const result = renderPjsip({
      trunks: [{
        name: 'KT 회선 1', host: '1.2.3.4', port: 5060,
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

  it('renders unauthenticated trunk without auth section', () => {
    const result = renderPjsip({
      trunks: [{
        name: 'Direct Carrier', host: '5.6.7.8', port: 5060,
        username: '', password: '', fromDomain: '',
        codecs: 'alaw,ulaw', enabled: true,
      }],
      agents: [],
    });
    expect(result).toContain('[trunk-direct-carrier-aor]');
    expect(result).not.toContain('[trunk-direct-carrier-auth]');
    expect(result).not.toContain('outbound_auth=trunk-direct-carrier-auth');
    expect(result).not.toContain('from_user=');
  });

  it('skips disabled trunks', () => {
    const result = renderPjsip({
      trunks: [{ name: 'Off', host: '1.1.1.1', port: 5060,
        username: 'u', password: 'p', fromDomain: 'd', codecs: 'alaw', enabled: false }],
      agents: [],
    });
    expect(result).not.toContain('[trunk-');
  });

  it('renders agent endpoint for agent with sipPassword', () => {
    const result = renderPjsip({
      trunks: [],
      agents: [{
        extension: '1001',
        agentName: 'Agent1',
        sipPassword: 'sip123',
        callerIdPrivacy: 'prohib',
        pickupGroup: 'queue-sales',
        pickupType: 'STRONG',
      }],
    });
    expect(result).toContain('[1001-auth]');
    expect(result).toContain('password=sip123');
    expect(result).toContain('[1001]');
    expect(result).toContain('callerid=Agent1 <1001>');
    expect(result).toContain('context=agent-phone-1001');
    expect(result).toContain('callerid_privacy=prohib');
    expect(result).toContain('named_call_group=queue-sales');
    expect(result).toContain('named_pickup_group=queue-sales,all-agents');
  });

  it('skips agents without sipPassword', () => {
    const result = renderPjsip({
      trunks: [],
      agents: [{ extension: '1002', agentName: 'Agent2', sipPassword: null }],
    });
    expect(result).not.toContain('[1002]');
  });

  it('throws on empty slug from trunk name', () => {
    expect(() => renderPjsip({
      trunks: [{ name: '!!!', host: '1.1.1.1', port: 5060, username: 'u', password: 'p', fromDomain: 'd', codecs: 'alaw', enabled: true }],
      agents: [],
    })).toThrow('empty slug');
  });

  it('skips agents with empty string sipPassword', () => {
    const result = renderPjsip({
      trunks: [],
      agents: [{ extension: '1003', agentName: 'Agent3', sipPassword: '' }],
    });
    expect(result).not.toContain('[1003]');
  });

  it('throws on newline injection in trunk host', () => {
    expect(() => renderPjsip({
      trunks: [{ name: 'safe', host: '1.1.1.1\ntype=malicious', port: 5060, username: 'u', password: 'p', fromDomain: 'd', codecs: 'alaw', enabled: true }],
      agents: [],
    })).toThrow('illegal newline');
  });
});
