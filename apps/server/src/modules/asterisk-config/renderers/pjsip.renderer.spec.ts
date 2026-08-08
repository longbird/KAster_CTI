import { renderPjsip } from './pjsip.renderer';

describe('renderPjsip', () => {
  it('renders global and transport sections', () => {
    const result = renderPjsip({ trunks: [], agents: [] });
    expect(result).toContain('[global]');
    expect(result).toContain('endpoint_identifier_order=auth_username,username,ip,anonymous');
    expect(result).toContain('[transport-udp]');
    expect(result).toContain('[transport-ws]');
    expect(result).toContain('bind=0.0.0.0:48950');
    expect(result).toContain('bind=0.0.0.0:8088');
  });

  it('renders custom SIP register port from system settings', () => {
    // 기본값(48950)과 다른 임의의 값을 쓴다. 같은 값이면 override 가 동작하는지
    // 검증되지 않는다 (예전에 실제로 그런 상태였다).
    const result = renderPjsip({ trunks: [], agents: [], sipRegisterPort: 15060 });
    expect(result).toContain('bind=0.0.0.0:15060');
  });

  it('renders external media and signaling addresses for NAT traversal', () => {
    const result = renderPjsip({
      trunks: [],
      agents: [],
      externalMediaAddress: '49.247.46.86',
      externalSignalingAddress: '49.247.46.86',
      localNets: ['10.0.0.0/8', '172.16.0.0/12'],
    });
    expect(result).toContain('external_media_address=49.247.46.86');
    expect(result).toContain('external_signaling_address=49.247.46.86');
    expect(result).toContain('local_net=10.0.0.0/8');
    expect(result).toContain('local_net=172.16.0.0/12');
    expect(result).toContain('[transport-ws]\ntype=transport\nprotocol=ws\nbind=0.0.0.0:8088\nexternal_media_address=49.247.46.86');
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
        phoneDirectAllowedIps: ['203.0.113.10', '203.0.113.11/32'],
        callerIdPrivacy: 'prohib',
        pickupGroup: 'queue-sales',
        pickupType: 'STRONG',
      }],
    });
    expect(result).toContain('[1001-auth]');
    expect(result).toContain('auth_type=userpass');
    expect(result).toContain('realm=asterisk');
    expect(result).toContain('password=sip123');
    expect(result).toContain('[1001]');
    expect(result).toContain('callerid=Agent1 <1001>');
    expect(result).toContain('context=agent-phone-1001');
    expect(result).toContain('max_contacts=2');
    expect(result).toContain('allow=alaw,ulaw');
    expect(result).toContain('media_encryption=dtls');
    expect(result).toContain('dtls_verify=fingerprint');
    expect(result).toContain('ice_support=yes');
    expect(result).toContain('webrtc=yes');
    expect(result).toContain('moh_suggest=default');
    expect(result).toContain('callerid_privacy=prohib');
    expect(result).toContain('deny=0.0.0.0/0.0.0.0');
    expect(result).toContain('permit=203.0.113.10');
    expect(result).toContain('permit=203.0.113.11/32');
    expect(result).toContain('named_call_group=queue-sales');
    expect(result).toContain('named_pickup_group=queue-sales,all-agents');
  });

  it('uses extension display name for SIP callerid when provided', () => {
    const result = renderPjsip({
      trunks: [],
      agents: [{
        extension: '1001',
        agentName: '홍길동',
        extensionDisplayName: '본사 1번 데스크',
        sipPassword: 'sip123',
      }],
    });

    expect(result).toContain('callerid=본사 1번 데스크 <1001>');
    expect(result).not.toContain('callerid=홍길동 <1001>');
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
