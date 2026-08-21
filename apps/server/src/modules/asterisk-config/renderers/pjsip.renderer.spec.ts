import { renderPjsip } from './pjsip.renderer';

const TRUNK = {
  name: '070-5234-6380', host: '27.255.98.132', port: 5060,
  username: '', password: '', fromDomain: '', codecs: 'alaw,ulaw', enabled: true,
};

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

  // 통신사는 국선 INVITE 를 표준 포트 5060 으로 보낸다. 전화기 등록 포트를 비표준으로
  // 옮기면(스캐너 회피) 그 하나뿐인 transport 가 같이 옮겨가서 국선 인입이 통째로 끊긴다.
  // 실제로 이 현장이 그 상태였다 — 발신만 되고 수신은 통신사 안내멘트로 끝났다.
  it('keeps a standard-port transport for trunks when phones use a non-standard port', () => {
    const result = renderPjsip({ trunks: [TRUNK], agents: [], sipRegisterPort: 48950 });
    expect(result).toContain('bind=0.0.0.0:48950');
    expect(result).toContain('[transport-trunk-udp]\ntype=transport\nprotocol=udp\nbind=0.0.0.0:5060');
    expect(result).toContain('transport=transport-trunk-udp');
  });

  // 통신사가 표준 포트로 보내지 않는 현장이 있다. 실제로 이 현장은 36070 이었고,
  // 통신사가 보내는 포트를 안 열어두면 OPTIONS 부터 무응답이라 국선이 통째로 죽는다.
  it('binds the trunk transport on the port the carrier was given', () => {
    const result = renderPjsip({
      trunks: [TRUNK], agents: [], sipRegisterPort: 48950, trunkSignalingPort: 36070,
    });
    expect(result).toContain('[transport-trunk-udp]\ntype=transport\nprotocol=udp\nbind=0.0.0.0:36070');
    expect(result).toContain('transport=transport-trunk-udp');
  });

  // 두 transport 가 같은 포트를 물면 Asterisk 가 기동에 실패한다.
  it('uses the single transport when phones already sit on the carrier port', () => {
    const result = renderPjsip({ trunks: [TRUNK], agents: [], sipRegisterPort: 5060 });
    expect(result).not.toContain('[transport-trunk-udp]');
    expect(result).toContain('transport=transport-udp');
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

  // 통신사가 SDP 에 telephone-event 를 올리지 않는 현장이 있다. 그러면 RFC2833 이
  // 협상되지 않아 rfc4733 로는 DTMF 가 통째로 사라진다 — ARS 에서 키를 눌러도
  // 아무 일도 일어나지 않고 안내만 다시 나온다. auto 는 협상되면 rfc4733, 아니면
  // 음성 대역에서 톤을 직접 검출한다. (2026-08-21: 이 현장 SDP 가 "8 0 18 4" 였다.)
  it('lets the trunk fall back to inband DTMF detection', () => {
    const result = renderPjsip({ trunks: [TRUNK], agents: [] });
    expect(result).toContain('dtmf_mode=auto');
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
    expect(result).toContain('remove_existing=yes');
    expect(result).toContain('qualify_frequency=30');
    expect(result).toContain('allow=alaw,ulaw');
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

  // 데스크폰은 DTLS-SRTP 도 AVPF 도 못 한다. 이 설정이 하나라도 남으면 전화기가 울리다
  // 488 로 끊고(cause 58), 등록은 멀쩡해 보이는데 통화만 안 되는 상태가 된다.
  it('leaves agent endpoints on plain RTP so a desk phone can take the call', () => {
    const result = renderPjsip({
      trunks: [],
      agents: [{ extension: '1001', agentName: 'Agent1', sipPassword: 'sip123' }],
    });

    for (const webrtcOnly of [
      'webrtc=yes',
      'media_encryption=dtls',
      'use_avpf=yes',
      'ice_support=yes',
      'rtcp_mux=yes',
      'dtls_verify=',
      'dtls_setup=',
      'dtls_auto_generate_cert=',
      'media_use_received_transport=',
    ]) {
      expect(result).not.toContain(webrtcOnly);
    }
  });
});
