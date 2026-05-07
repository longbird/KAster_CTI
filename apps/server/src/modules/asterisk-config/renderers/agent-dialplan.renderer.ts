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

export type OutboundCallerIdRuleMatchType =
  | 'EXACT'
  | 'PREFIX'
  | 'REGEX'
  | 'DIALPLAN_PATTERN';

export interface OutboundCallerIdRuleInput {
  matchType: OutboundCallerIdRuleMatchType;
  sourceNumberPattern: string;
  callerIdNumber: string;
  displayName: string | null;
  priority: number;
  enabled: boolean;
}

export interface AgentDialplanInput {
  allowDirectSipDial: boolean;
  defaultOutboundCallerId: string | null;
  allowedOutboundCallerIds: string[];
  trunks: AgentDialplanTrunkInput[];
  agents: AgentDialplanAgentInput[];
  /**
   * 아웃바운드 발신번호 매핑 룰. 빈 배열이면 dialplan 은 기존처럼 단일
   * defaultOutboundCallerId 만 사용한다. PR1-3B 에서 도입.
   */
  outboundCallerIdRules?: OutboundCallerIdRuleInput[];
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
  hasRules: boolean,
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
  if (hasRules) {
    // 룰 sub-context 가 CALLERID(num) / CALLERID(name) 을 set 후 Return.
    // sub-context 의 fallback 이 defaultCallerId 도 처리하므로 inline Set 은 제거.
    lines.push(' same => n,Gosub(outbound-cid-rules,${EXTEN},1)');
  } else {
    lines.push(` same => n,Set(CALLERID(num)=${callerId})`);
    lines.push(` same => n,Set(CALLERID(name)=${callerId})`);
  }
  lines.push(` same => n,Set(CALLERID(pres)=${agent.callerIdPrivacy})`);
  lines.push(` same => n,Dial(PJSIP/\${EXTEN}@${trunkEndpoint},60,b(func-set-sipheaders^s^1)U(agent-pre-bridge))`);
  lines.push(' same => n,Hangup()');
  return lines.join('\n');
}

/**
 * 룰을 dialplan exten 패턴으로 변환.
 * - DIALPLAN_PATTERN: pattern 그대로 (`_NXX`, `_010.`)
 * - EXACT: pattern 그대로 (`01012345678`)
 * - PREFIX: `_<prefix>.` (010 → _010.)
 * - REGEX: dialplan 으로 표현 불가 → null. NoOp 로깅만.
 */
function ruleToDialplanExten(rule: OutboundCallerIdRuleInput): string | null {
  switch (rule.matchType) {
    case 'DIALPLAN_PATTERN':
      return rule.sourceNumberPattern;
    case 'EXACT':
      return rule.sourceNumberPattern;
    case 'PREFIX':
      return `_${rule.sourceNumberPattern}.`;
    case 'REGEX':
      return null;
    default:
      return null;
  }
}

function renderOutboundCidRules(
  defaultCallerId: string | null,
  rules: OutboundCallerIdRuleInput[],
): string | null {
  const enabledRules = rules
    .filter((r) => r.enabled)
    .filter((r) => r.matchType !== 'REGEX')
    .sort((a, b) => a.priority - b.priority);

  if (enabledRules.length === 0 && !defaultCallerId) {
    return null;
  }

  const lines = ['[outbound-cid-rules]'];
  // dialplan 평가 시 most-specific 매칭이 우선. priority 가 같은 specificity 내
  // 충돌을 의도하는 운영자 헤더용 NoOp 으로만 표시한다.
  const seenPatterns = new Set<string>();
  for (const rule of enabledRules) {
    const exten = ruleToDialplanExten(rule);
    if (!exten) continue;
    if (seenPatterns.has(exten)) {
      // 같은 패턴이 두 번 등장하면 priority 작은 것만 채택 (이미 sort 되어 있음).
      continue;
    }
    seenPatterns.add(exten);

    assertNoNewlines(rule.callerIdNumber, 'callerIdNumber');
    if (rule.displayName) assertNoNewlines(rule.displayName, 'displayName');

    const displayName = rule.displayName ?? rule.callerIdNumber;
    lines.push(
      `exten => ${exten},1,NoOp(Outbound CID rule ${rule.matchType} prio=${rule.priority})`,
      ` same => n,Set(CALLERID(num)=${rule.callerIdNumber})`,
      ` same => n,Set(CALLERID(name)=${displayName})`,
      ' same => n,Return()',
    );
  }

  // REGEX 룰은 dialplan 적용 안됨 — 운영자 인지를 위해 NoOp 로 명시.
  for (const rule of rules.filter(
    (r) => r.matchType === 'REGEX' && r.enabled,
  )) {
    lines.push(
      `; NOTE: REGEX rule prio=${rule.priority} pattern=${rule.sourceNumberPattern.slice(0, 60)} 는 dialplan 에서 평가하지 않습니다 (서버 측 매칭 전용).`,
    );
  }

  // fallback: 모든 미매칭 → defaultCallerId
  if (defaultCallerId) {
    assertNoNewlines(defaultCallerId, 'defaultOutboundCallerId');
    lines.push(
      'exten => _X.,1,NoOp(Outbound CID rule fallback)',
      ` same => n,Set(CALLERID(num)=${defaultCallerId})`,
      ` same => n,Set(CALLERID(name)=${defaultCallerId})`,
      ' same => n,Return()',
    );
  } else {
    lines.push(
      'exten => _X.,1,NoOp(Outbound CID rule fallback — default 미설정)',
      ' same => n,Return()',
    );
  }

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

  const rules = input.outboundCallerIdRules ?? [];
  const hasUsableRules = rules.some(
    (r) => r.enabled && r.matchType !== 'REGEX',
  );
  const cidRulesContext = hasUsableRules
    ? renderOutboundCidRules(input.defaultOutboundCallerId, rules)
    : null;

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

  const sections: string[] = [
    header,
    ...input.agents.map((agent) => renderAgentEntryContext(agent, input.allowDirectSipDial)),
    ...input.agents.map((agent) =>
      renderAgentOutboundRoute(
        agent,
        primaryTrunkEndpoint,
        input.defaultOutboundCallerId,
        Boolean(cidRulesContext),
      ),
    ),
    fromQueue,
    sipHeaderHook,
    renderPreBridgeDispatcher(input.agents),
    ...input.agents.map(renderPreBridgeAgentBranch),
  ];

  if (cidRulesContext) {
    sections.push(cidRulesContext);
  }

  return sections.join('\n\n');
}
