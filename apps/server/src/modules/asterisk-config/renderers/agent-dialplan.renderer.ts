import { assertNoNewlines, toSlug } from './renderer-utils';

export interface AgentDialplanTrunkInput {
  name: string;
  enabled: boolean;
}

export interface AgentDialplanAgentInput {
  extension: string;
  outboundEnabled: boolean;
  callerIdPrivacy: 'allowed_not_screened' | 'prohib';
  liveRecordingEnabled: boolean;
}

export interface AgentDialplanInput {
  allowDirectSipDial: boolean;
  defaultOutboundCallerId: string | null;
  allowedOutboundCallerIds: string[];
  trunks: AgentDialplanTrunkInput[];
  agents: AgentDialplanAgentInput[];
}

function getPrimaryTrunkEndpoint(trunks: AgentDialplanTrunkInput[]): string | null {
  const trunk = trunks.find((item) => item.enabled);
  if (!trunk) return null;
  const slug = toSlug(trunk.name);
  return slug ? `trunk-${slug}` : null;
}

function buildRecordFileLines(): string[] {
  return [
    ' same => n,ExecIf($["${LEN(${REC_FILE})}"="0"]?Set(__REC_FILE=${STRFTIME(${EPOCH},,%Y/%m/%d)}/${CHANNEL(linkedid)}-${UNIQUEID}.wav))',
  ];
}

function renderAgentEntryContext(
  agent: AgentDialplanAgentInput,
  allowDirectSipDial: boolean,
): string {
  const contextName = `agent-phone-${agent.extension}`;
  const lines = [
    `[${contextName}]`,
    `exten => _0X.,1,NoOp(Agent endpoint context ${agent.extension} / \${EXTEN})`,
  ];

  if (!allowDirectSipDial || !agent.outboundEnabled) {
    lines.push(' same => n,Playback(ss-noservice)');
    lines.push(' same => n,Hangup()');
    return lines.join('\n');
  }

  lines.push(` same => n,Goto(outbound-main-${agent.extension},\${EXTEN},1)`);
  lines.push(`exten => _[12]XXX,1,NoOp(Internal endpoint call ${agent.extension} / \${EXTEN})`);
  lines.push(' same => n,Dial(PJSIP/${EXTEN},20,tTU(agent-pre-bridge))');
  lines.push(' same => n,Hangup()');
  return lines.join('\n');
}

function renderAgentOutboundRoute(
  agent: AgentDialplanAgentInput,
  trunkEndpoint: string | null,
  callerId: string | null,
): string {
  const contextName = `outbound-main-${agent.extension}`;
  const lines = [
    `[${contextName}]`,
    'exten => _0X.,1,NoOp(Outbound ${EXTEN})',
  ];

  if (!trunkEndpoint || !callerId) {
    lines.push(' same => n,Playback(ss-noservice)');
    lines.push(' same => n,Hangup()');
    return lines.join('\n');
  }

  assertNoNewlines(callerId, 'defaultOutboundCallerId');
  assertNoNewlines(trunkEndpoint, 'trunkEndpoint');

  lines.push(...buildRecordFileLines());
  lines.push(` same => n,Set(CALLERID(num)=${callerId})`);
  lines.push(` same => n,Set(CALLERID(name)=${callerId})`);
  lines.push(` same => n,Set(CALLERID(pres)=${agent.callerIdPrivacy})`);
  lines.push(` same => n,Dial(PJSIP/\${EXTEN}@${trunkEndpoint},60,b(func-set-sipheaders^s^1)U(agent-pre-bridge))`);
  lines.push(' same => n,Hangup()');
  return lines.join('\n');
}

function renderPreBridgeAgentBranch(agent: AgentDialplanAgentInput): string {
  const lines = [
    `[agent-pre-bridge-${agent.extension}]`,
    'exten => s,1,NoOp(Agent pre-bridge handler)',
  ];

  if (agent.liveRecordingEnabled) {
    lines.push(' same => n,ExecIf($["${LEN(${REC_FILE})}"!="0"]?MixMonitor(${REC_BASE_DIR}/${REC_FILE},b))');
  }

  lines.push(' same => n,Return()');
  return lines.join('\n');
}

function renderPreBridgeDispatcher(agents: AgentDialplanAgentInput[]): string {
  const lines = [
    '[agent-pre-bridge]',
    'exten => s,1,NoOp(Agent pre-bridge dispatcher)',
    ' same => n,Set(__KASTER_AGENT_EXT=${CUT(CUT(CHANNEL(name),/,2),-,1)})',
  ];

  for (const agent of agents) {
    lines.push(` same => n,GotoIf($["\${KASTER_AGENT_EXT}"="${agent.extension}"]?agent-pre-bridge-${agent.extension},s,1)`);
  }

  lines.push(' same => n,Return()');
  return lines.join('\n');
}

export function renderAgentDialplan(input: AgentDialplanInput): string {
  const primaryTrunkEndpoint = getPrimaryTrunkEndpoint(input.trunks);
  const allowedCallerIdText = input.allowedOutboundCallerIds.length > 0
    ? input.allowedOutboundCallerIds.join(',')
    : 'none';

  const header = [
    '[agent-phone]',
    'exten => _X.,1,NoOp(Shared agent context ${EXTEN})',
    ` same => n,NoOp(Allowed caller IDs ${allowedCallerIdText})`,
    ' same => n,Playback(ss-noservice)',
    ' same => n,Hangup()',
  ].join('\n');

  const fromQueue = [
    '[from-queue]',
    'exten => _X.,1,NoOp(From Queue to Agent ${EXTEN})',
    ...buildRecordFileLines(),
    ' same => n,Dial(PJSIP/${EXTEN},20,tTU(agent-pre-bridge))',
    ' same => n,Hangup()',
  ].join('\n');

  const sipHeaderHook = [
    '[func-set-sipheaders]',
    'exten => s,1,NoOp(Outbound SIP header hook)',
    ' same => n,Return()',
  ].join('\n');

  return [
    header,
    ...input.agents.map((agent) => renderAgentEntryContext(agent, input.allowDirectSipDial)),
    ...input.agents.map((agent) => renderAgentOutboundRoute(agent, primaryTrunkEndpoint, input.defaultOutboundCallerId)),
    fromQueue,
    sipHeaderHook,
    renderPreBridgeDispatcher(input.agents),
    ...input.agents.map(renderPreBridgeAgentBranch),
  ].join('\n\n');
}
