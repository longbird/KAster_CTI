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
  sipPassword: string | null;
}

export interface PjsipInput {
  trunks: TrunkInput[];
  agents: AgentInput[];
  sipRegisterPort?: number | null;
}

import { assertNoNewlines, toSlug } from './renderer-utils';

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
  assertNoNewlines(agent.sipPassword, 'sipPassword');
  return [
    `[${agent.extension}-auth]`,
    `type=auth`,
    `auth_type=userpass`,
    `username=${agent.extension}`,
    `password=${agent.sipPassword}`,
    ``,
    // Many desk phones REGISTER to sip:<host> while authenticating as the extension.
    // Using the extension itself as the AOR name is the most compatible layout.
    `[${agent.extension}]`,
    `type=aor`,
    `max_contacts=1`,
    ``,
    `[${agent.extension}]`,
    `type=endpoint`,
    `context=agent-phone`,
    `disallow=all`,
    `allow=alaw,ulaw`,
    `auth=${agent.extension}-auth`,
    `aors=${agent.extension}`,
    `callerid=${agent.agentName} <${agent.extension}>`,
    `direct_media=no`,
    `rtp_symmetric=yes`,
    `force_rport=yes`,
    `rewrite_contact=yes`,
  ].join('\n');
}

export function renderPjsip(input: PjsipInput): string {
  const sipRegisterPort = input.sipRegisterPort && input.sipRegisterPort > 0 ? input.sipRegisterPort : 36070;
  const header = [
    `[global]`,
    `type=global`,
    `user_agent=KAster_CTI`,
    ``,
    `[transport-udp]`,
    `type=transport`,
    `protocol=udp`,
    `bind=0.0.0.0:${sipRegisterPort}`,
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
