import { assertNoNewlines, toSlug } from './renderer-utils';

export interface AgentDialplanTrunkInput {
  name: string;
  enabled: boolean;
}

export interface AgentDialplanInput {
  allowDirectSipDial: boolean;
  defaultOutboundCallerId: string | null;
  allowedOutboundCallerIds: string[];
  trunks: AgentDialplanTrunkInput[];
}

function getPrimaryTrunkEndpoint(trunks: AgentDialplanTrunkInput[]): string | null {
  const trunk = trunks.find((item) => item.enabled);
  if (!trunk) return null;
  const slug = toSlug(trunk.name);
  return slug ? `trunk-${slug}` : null;
}

function renderOutboundRoute(contextName: string, trunkEndpoint: string | null, callerId: string | null): string {
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

  lines.push(` same => n,Set(CALLERID(num)=${callerId})`);
  lines.push(` same => n,Set(CALLERID(name)=${callerId})`);
  lines.push(` same => n,Dial(PJSIP/\${EXTEN}@${trunkEndpoint},60,b(func-set-sipheaders^s^1))`);
  lines.push(' same => n,Hangup()');
  return lines.join('\n');
}

export function renderAgentDialplan(input: AgentDialplanInput): string {
  const primaryTrunkEndpoint = getPrimaryTrunkEndpoint(input.trunks);
  const allowedCallerIdText = input.allowedOutboundCallerIds.length > 0
    ? input.allowedOutboundCallerIds.join(',')
    : 'none';

  const agentPhoneLines = [
    '[agent-phone]',
    'exten => _X.,1,NoOp(Agent endpoint context ${EXTEN})',
    ` same => n,NoOp(Allowed caller IDs ${allowedCallerIdText})`,
  ];

  if (input.allowDirectSipDial) {
    agentPhoneLines.push(' same => n,Goto(phone-outbound-main,${EXTEN},1)');
  } else {
    agentPhoneLines.push(' same => n,Playback(ss-noservice)');
    agentPhoneLines.push(' same => n,Hangup()');
  }

  return [
    agentPhoneLines.join('\n'),
    renderOutboundRoute('outbound-main', primaryTrunkEndpoint, input.defaultOutboundCallerId),
    renderOutboundRoute('phone-outbound-main', primaryTrunkEndpoint, input.defaultOutboundCallerId),
  ].join('\n\n');
}
