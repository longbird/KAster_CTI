export interface TrunkInput {
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  fromDomain: string;
  codecs: string;
  enabled: boolean;
}

export interface AgentInput {
  extension: string;
  agentName: string;
  extensionDisplayName?: string | null;
  sipPassword: string | null;
  phoneDirectAllowedIps?: string[];
  context?: string;
  callerIdPrivacy?: 'allowed_not_screened' | 'prohib';
  pickupGroup?: string | null;
  pickupType?: 'STRONG' | 'NORMAL' | 'NOT_USE';
}

export interface PjsipInput {
  trunks: TrunkInput[];
  agents: AgentInput[];
  sipRegisterPort?: number | null;
  externalMediaAddress?: string | null;
  externalSignalingAddress?: string | null;
  localNets?: string[];
  /** 통신사가 국선 INVITE 를 보내는 포트. 통신사와 합의한 값이라 현장마다 다르다. */
  trunkSignalingPort?: number | null;
}

import { assertNoNewlines, toSlug } from './renderer-utils';
import { DEFAULT_SIP_REGISTER_PORT } from '../../../common/call-routing.constants';

const SIP_WS_PORT = 8088;

// 통신사는 국선 INVITE 를 표준 SIP 포트로 보낸다. 전화기 등록 포트를 비표준으로 옮기는 것은
// 스캐너를 피하려는 의도적 설정이지만, transport 가 하나뿐이면 국선까지 같이 끌려가
// 인입이 통째로 끊긴다. 발신은 우리가 먼저 나가므로 멀쩡해서 더 늦게 발견된다.
// (2026-08-21: 실제로 36070 -> 48950 으로 옮기고 국선 인입이 통신사 안내멘트로 끝났다.)
const DEFAULT_SIP_TRUNK_PORT = 5060;
const TRUNK_TRANSPORT = 'transport-trunk-udp';
const AGENT_TRANSPORT = 'transport-udp';
const ASTERISK_AUTH_REALM = 'asterisk';

function isValidIpv4Cidr(value: string) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}(?:\/(?:[0-9]|[12][0-9]|3[0-2]))?$/.test(value)) return false;
  const [address] = value.split('/');
  return address.split('.').every((part) => {
    const octet = Number(part);
    return Number.isInteger(octet) && octet >= 0 && octet <= 255;
  });
}

function renderTransportNatLines(input: PjsipInput, localNets: string[]): string[] {
  return [
    ...(input.externalMediaAddress ? [`external_media_address=${input.externalMediaAddress}`] : []),
    ...(input.externalSignalingAddress ? [`external_signaling_address=${input.externalSignalingAddress}`] : []),
    ...localNets.map((localNet) => `local_net=${localNet}`),
  ];
}

function renderTrunk(trunk: TrunkInput, transport: string): string {
  const slug = toSlug(trunk.name);
  if (!slug) throw new Error(`Trunk name "${trunk.name}" produces an empty slug`);
  assertNoNewlines(trunk.host, 'host');
  if (trunk.username) assertNoNewlines(trunk.username, 'username');
  if (trunk.password) assertNoNewlines(trunk.password, 'password');
  if (trunk.fromDomain) assertNoNewlines(trunk.fromDomain, 'fromDomain');
  const hasAuth = trunk.username !== '' && trunk.password !== '';
  const authSection = hasAuth
    ? [
        `[trunk-${slug}-auth]`,
        `type=auth`,
        `auth_type=userpass`,
        `username=${trunk.username}`,
        `password=${trunk.password}`,
        ``,
      ]
    : [];
  const endpointLines = [
    `[trunk-${slug}]`,
    `type=endpoint`,
    `transport=${transport}`,
    `context=inbound-main`,
    `disallow=all`,
    `allow=${trunk.codecs}`,
    `aors=trunk-${slug}-aor`,
    ...(hasAuth ? [`outbound_auth=trunk-${slug}-auth`, `from_user=${trunk.username}`] : []),
    ...(trunk.fromDomain ? [`from_domain=${trunk.fromDomain}`] : []),
    `direct_media=no`,
    `rtp_symmetric=yes`,
    `force_rport=yes`,
    `rewrite_contact=yes`,
    `trust_id_inbound=yes`,
    `send_pai=yes`,
    // 통신사가 SDP 에 telephone-event 를 올리지 않으면 RFC2833 이 협상되지 않고,
    // rfc4733 로 고정돼 있으면 DTMF 가 통째로 사라진다. ARS 에서 키를 눌러도 아무
    // 일도 일어나지 않고 안내만 다시 나오는데, 신호는 오고 있으니 어디가 잘못됐는지
    // 로그만 봐서는 알 수 없다. auto 는 협상되면 rfc4733, 아니면 음성 대역에서
    // 톤을 직접 검출한다. (2026-08-21: 이 현장 SDP 가 "m=audio ... RTP/AVP 8 0 18 4".)
    `dtmf_mode=auto`,
  ];
  return [
    ...authSection,
    `[trunk-${slug}-aor]`,
    `type=aor`,
    `contact=sip:${trunk.host}:${trunk.port}`,
    ``,
    `[trunk-${slug}-identify]`,
    `type=identify`,
    `endpoint=trunk-${slug}`,
    `match=${trunk.host}`,
    ``,
    ...endpointLines,
  ].join('\n');
}

function renderAgent(agent: AgentInput): string {
  if (!agent.sipPassword) return '';
  assertNoNewlines(agent.extension, 'extension');
  assertNoNewlines(agent.agentName, 'agentName');
  if (agent.extensionDisplayName) assertNoNewlines(agent.extensionDisplayName, 'extensionDisplayName');
  assertNoNewlines(agent.sipPassword, 'sipPassword');
  if (agent.context) assertNoNewlines(agent.context, 'context');
  if (agent.pickupGroup) assertNoNewlines(agent.pickupGroup, 'pickupGroup');
  const phoneDirectAllowedIps = [...new Set((agent.phoneDirectAllowedIps ?? [])
    .map((ip) => ip.trim())
    .filter((ip) => ip && isValidIpv4Cidr(ip)))];
  phoneDirectAllowedIps.forEach((ip) => assertNoNewlines(ip, 'phoneDirectAllowedIp'));

  const namedCallGroup = agent.pickupType && agent.pickupType !== 'NOT_USE'
    ? agent.pickupGroup || 'all-agents'
    : null;
  const namedPickupGroup = agent.pickupType === 'STRONG'
    ? [namedCallGroup, 'all-agents'].filter(Boolean).join(',')
    : namedCallGroup;

  return [
    `[${agent.extension}-auth]`,
    `type=auth`,
    `auth_type=userpass`,
    `username=${agent.extension}`,
    `realm=${ASTERISK_AUTH_REALM}`,
    `password=${agent.sipPassword}`,
    ``,
    // Many desk phones REGISTER to sip:<host> while authenticating as the extension.
    // Using the extension itself as the AOR name is the most compatible layout.
    `[${agent.extension}]`,
    `type=aor`,
    `max_contacts=2`,
    // A softphone that crashes, loses power, or is closed leaves its contact behind: it cannot
    // send the de-registration, and nothing else removes it. Once max_contacts is filled with
    // such dead entries Asterisk answers the next REGISTER with 403 and that agent can no longer
    // take calls. Letting a fresh registration evict the oldest contact keeps the newest phone
    // reachable no matter how the previous one went away.
    `remove_existing=yes`,
    // Softphones sit behind NAT, and the router closes the UDP pinhole between registrations.
    // An INVITE that arrives in that gap is dropped and the agent's phone never rings, with
    // nothing anywhere reporting a failure. Qualifying keeps the pinhole open and, as a side
    // effect, makes a dead contact visible instead of leaving it listed as if it were fine.
    // (2026-08-21: measured the NAT port moving 41768 -> 36131 -> 54724 between registrations.)
    `qualify_frequency=30`,
    ``,
    `[${agent.extension}]`,
    `type=endpoint`,
    `context=${agent.context || `agent-phone-${agent.extension}`}`,
    `disallow=all`,
    `allow=alaw,ulaw`,
    `auth=${agent.extension}-auth`,
    `aors=${agent.extension}`,
    `callerid=${agent.extensionDisplayName?.trim() || agent.agentName} <${agent.extension}>`,
    `callerid_privacy=${agent.callerIdPrivacy || 'allowed_not_screened'}`,
    ...(phoneDirectAllowedIps.length > 0
      ? [
          `deny=0.0.0.0/0.0.0.0`,
          ...phoneDirectAllowedIps.map((ip) => `permit=${ip}`),
        ]
      : []),
    ...(namedCallGroup ? [`named_call_group=${namedCallGroup}`] : []),
    ...(namedPickupGroup ? [`named_pickup_group=${namedPickupGroup}`] : []),
    `direct_media=no`,
    `rtp_symmetric=yes`,
    `force_rport=yes`,
    `rewrite_contact=yes`,
    // Plain RTP, deliberately. These endpoints previously carried webrtc=yes, which forces
    // DTLS-SRTP, AVPF, ICE and rtcp-mux — everything a browser needs and nothing a desk phone
    // can do. A handset registered fine and then rejected every INVITE with 488, which Asterisk
    // reports as cause 58, "Bearer capability not available": the phone lit up for a second and
    // went dark. One endpoint cannot offer both, and these agents use desk phones and a native
    // softphone that both speak plain RTP.
    `moh_suggest=default`,
  ].join('\n');
}

export function renderPjsip(input: PjsipInput): string {
  const sipRegisterPort = input.sipRegisterPort && input.sipRegisterPort > 0
    ? input.sipRegisterPort
    : DEFAULT_SIP_REGISTER_PORT;
  if (input.externalMediaAddress) assertNoNewlines(input.externalMediaAddress, 'externalMediaAddress');
  if (input.externalSignalingAddress) assertNoNewlines(input.externalSignalingAddress, 'externalSignalingAddress');
  const localNets = [...new Set((input.localNets || []).map((item) => item.trim()).filter(Boolean))];
  localNets.forEach((localNet) => assertNoNewlines(localNet, 'localNet'));
  const transportNatLines = renderTransportNatLines(input, localNets);
  // 전화기가 이미 표준 포트에 있으면 국선용을 따로 두지 않는다.
  // 두 transport 가 같은 포트를 물면 Asterisk 가 기동에 실패한다.
  const trunkSignalingPort = input.trunkSignalingPort && input.trunkSignalingPort > 0
    ? input.trunkSignalingPort
    : DEFAULT_SIP_TRUNK_PORT;
  const needsTrunkTransport = sipRegisterPort !== trunkSignalingPort;
  const trunkTransport = needsTrunkTransport ? TRUNK_TRANSPORT : AGENT_TRANSPORT;
  const header = [
    `[global]`,
    `type=global`,
    `user_agent=KAster_CTI`,
    `endpoint_identifier_order=auth_username,username,ip,anonymous`,
    ``,
    `[transport-udp]`,
    `type=transport`,
    `protocol=udp`,
    `bind=0.0.0.0:${sipRegisterPort}`,
    ...transportNatLines,
    ``,
    `[transport-ws]`,
    `type=transport`,
    `protocol=ws`,
    `bind=0.0.0.0:${SIP_WS_PORT}`,
    ...transportNatLines,
    ...(needsTrunkTransport
      ? [
          ``,
          `[${TRUNK_TRANSPORT}]`,
          `type=transport`,
          `protocol=udp`,
          `bind=0.0.0.0:${trunkSignalingPort}`,
          ...transportNatLines,
        ]
      : []),
  ].join('\n');

  const trunks = input.trunks
    .filter((t) => t.enabled)
    .map((trunk) => renderTrunk(trunk, trunkTransport))
    .join('\n\n');

  const agents = input.agents
    .filter((a) => a.sipPassword !== null && a.sipPassword !== '')
    .map(renderAgent)
    .join('\n\n');

  return [header, trunks, agents].filter(Boolean).join('\n\n');
}
