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
}

import { assertNoNewlines, toSlug } from './renderer-utils';
import { DEFAULT_SIP_REGISTER_PORT } from '../../../common/call-routing.constants';

const SIP_WS_PORT = 8088;
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

function renderTrunk(trunk: TrunkInput): string {
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
    `transport=transport-udp`,
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
  ].join('\n');

  const trunks = input.trunks
    .filter((t) => t.enabled)
    .map(renderTrunk)
    .join('\n\n');

  const agents = input.agents
    .filter((a) => a.sipPassword !== null && a.sipPassword !== '')
    .map(renderAgent)
    .join('\n\n');

  return [header, trunks, agents].filter(Boolean).join('\n\n');
}
