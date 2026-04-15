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
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function assertNoNewlines(value: string, field: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`Field "${field}" contains illegal newline characters`);
  }
}

function renderTrunk(trunk: TrunkInput): string {
  const slug = toSlug(trunk.name);
  if (!slug) throw new Error(`Trunk name "${trunk.name}" produces an empty slug`);
  assertNoNewlines(trunk.host, 'host');
  assertNoNewlines(trunk.username, 'username');
  assertNoNewlines(trunk.password, 'password');
  assertNoNewlines(trunk.fromDomain, 'fromDomain');
  return [
    `[trunk-${slug}-auth]`,
    `type=auth`,
    `auth_type=userpass`,
    `username=${trunk.username}`,
    `password=${trunk.password}`,
    ``,
    `[trunk-${slug}-aor]`,
    `type=aor`,
    `contact=sip:${trunk.host}:${trunk.port}`,
    ``,
    `[trunk-${slug}-identify]`,
    `type=identify`,
    `endpoint=trunk-${slug}`,
    `match=${trunk.host}`,
    ``,
    `[trunk-${slug}]`,
    `type=endpoint`,
    `transport=transport-udp`,
    `context=inbound-main`,
    `disallow=all`,
    `allow=${trunk.codecs}`,
    `aors=trunk-${slug}-aor`,
    `outbound_auth=trunk-${slug}-auth`,
    `from_user=${trunk.username}`,
    `from_domain=${trunk.fromDomain}`,
    `direct_media=no`,
    `rtp_symmetric=yes`,
    `force_rport=yes`,
    `rewrite_contact=yes`,
    `trust_id_inbound=yes`,
    `send_pai=yes`,
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
    `[${agent.extension}-aor]`,
    `type=aor`,
    `max_contacts=1`,
    ``,
    `[${agent.extension}]`,
    `type=endpoint`,
    `context=agent-phone`,
    `disallow=all`,
    `allow=alaw,ulaw`,
    `auth=${agent.extension}-auth`,
    `aors=${agent.extension}-aor`,
    `callerid=${agent.agentName} <${agent.extension}>`,
    `direct_media=no`,
    `rtp_symmetric=yes`,
    `force_rport=yes`,
    `rewrite_contact=yes`,
  ].join('\n');
}

export function renderPjsip(input: PjsipInput): string {
  const header = [
    `[global]`,
    `type=global`,
    `user_agent=KAster_CTI`,
    ``,
    `[transport-udp]`,
    `type=transport`,
    `protocol=udp`,
    `bind=0.0.0.0:5060`,
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
