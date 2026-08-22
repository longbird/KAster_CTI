import {
  getBlockedOutboundDialplanPatterns,
  DOMESTIC_OUTBOUND_DIALPLAN_PATTERNS,
  INTERNATIONAL_OUTBOUND_DIALPLAN_PATTERNS,
  normalizeOutboundDialPermissions,
  OutboundDialPermissions,
  PAID_OUTBOUND_DIALPLAN_PATTERNS,
  REPRESENTATIVE_OUTBOUND_DIALPLAN_PATTERNS,
} from '../../../common/outbound-dial-policy.util';
import {
  AGENT_OFFER_AGI_PATH,
  AGENT_OFFER_CONTEXT,
  clampAgentOfferTimeoutSeconds,
} from '../../../common/call-routing.constants';
import {
  getMixMonitorOptions,
  getRecordingFileExtension,
  normalizeRecordingChannelMode,
  RecordingChannelMode,
} from './recording-mode';
import { assertNoNewlines, toSlug } from './renderer-utils';
import { isHandsetDialFeature } from '../../../common/feature-code-catalog';

export interface AgentDialplanTrunkInput {
  id?: string;
  name: string;
  enabled: boolean;
}

export interface AgentDialplanTrunkGroupInput {
  enabled: boolean;
  isDefault: boolean;
  strategy: 'PRIORITY' | string;
  members: Array<{
    priority: number;
    enabled: boolean;
    trunk: AgentDialplanTrunkInput;
  }>;
}

export interface AgentDialplanAgentInput {
  extension: string;
  outboundEnabled: boolean;
  callerIdPrivacy: 'allowed_not_screened' | 'prohib';
  liveRecordingEnabled: boolean;
  extensionLockMode?: 'UNLOCKED' | 'OUTBOUND_LOCKED' | 'FULL_LOCKED';
  branchIds?: string[];
  outboundDialPermissions?: OutboundDialPermissions;
}

export interface AgentDialplanSpeedDialInput {
  code: string;
  targetNumber: string;
  displayName: string | null;
  enabled: boolean;
}

export interface AgentDialplanFeatureCodeInput {
  featureKey: string;
  code: string | null;
  enabled: boolean;
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
  branchId?: string | null;
}

export interface AgentDialplanInput {
  allowDirectSipDial: boolean;
  defaultOutboundCallerId: string | null;
  allowedOutboundCallerIds: string[];
  recordingChannelMode?: RecordingChannelMode;
  trunks: AgentDialplanTrunkInput[];
  trunkGroups?: AgentDialplanTrunkGroupInput[];
  agents: AgentDialplanAgentInput[];
  /**
   * 상담원이 호를 수락/거절할 때까지 기다리는 시간(초).
   * 짧으면 상담원이 놓치고, 길면 발신자가 이유 없이 기다린다.
   * 범위 밖 값은 렌더 직전에 깎는다 (`clampAgentOfferTimeoutSeconds`).
   */
  offerTimeoutSeconds?: number;
  speedDials?: AgentDialplanSpeedDialInput[];
  /**
   * 기능코드 registry. HANDSET_DIAL 성격인 것만 렌더링한다.
   * SERVER_DTMF 성격(보류/해제/상담전환 완료)은 서버가 PBX 로 보내는 DTMF 라
   * dialplan 에 열면 CTI 세션 상태와 어긋난다.
   */
  featureCodes?: AgentDialplanFeatureCodeInput[];
  /**
   * 아웃바운드 발신번호 매핑 룰. 빈 배열이면 dialplan 은 기존처럼 단일
   * defaultOutboundCallerId 만 사용한다. PR1-3B 에서 도입.
   */
  outboundCallerIdRules?: OutboundCallerIdRuleInput[];
}

function toTrunkEndpoint(trunk: AgentDialplanTrunkInput): string | null {
  if (!trunk.enabled) return null;
  const slug = toSlug(trunk.name);
  return slug ? `trunk-${slug}` : null;
}

function getPrimaryTrunkEndpoint(trunks: AgentDialplanTrunkInput[]): string | null {
  const trunk = trunks.find((item) => item.enabled);
  return trunk ? toTrunkEndpoint(trunk) : null;
}

function getOutboundTrunkDialTarget(
  trunks: AgentDialplanTrunkInput[],
  trunkGroups: AgentDialplanTrunkGroupInput[] = [],
): string | null {
  const defaultGroup = trunkGroups.find((group) => group.enabled && group.isDefault);
  if (!defaultGroup) {
    const endpoint = getPrimaryTrunkEndpoint(trunks);
    return endpoint ? `PJSIP/\${EXTEN}@${endpoint}` : null;
  }

  const endpoints = defaultGroup.members
    .filter((member) => member.enabled && member.trunk.enabled)
    .sort((a, b) => a.priority - b.priority)
    .map((member) => toTrunkEndpoint(member.trunk))
    .filter((endpoint): endpoint is string => Boolean(endpoint));

  if (endpoints.length === 0) {
    return null;
  }

  return endpoints.map((endpoint) => `PJSIP/\${EXTEN}@${endpoint}`).join('&');
}

function buildRecordFileLines(recordingChannelMode: RecordingChannelMode): string[] {
  const extension = getRecordingFileExtension(recordingChannelMode);
  return [
    ` same => n,ExecIf($["\${LEN(\${REC_FILE})}"="0"]?Set(__REC_FILE=\${STRFTIME(\${EPOCH},,%Y/%m/%d)}/\${CHANNEL(linkedid)}-\${UNIQUEID}.${extension}))`,
  ];
}

function buildBlockedOutboundDialLines(
  contextLabel: string,
  permissions?: OutboundDialPermissions,
): string[] {
  return getBlockedOutboundDialplanPatterns(permissions).flatMap((pattern) => [
    `exten => ${pattern},1,NoOp(Blocked outbound dial ${contextLabel} / \${EXTEN})`,
    ' same => n,Playback(ss-noservice)',
    ' same => n,Hangup()',
  ]);
}

function buildAllowedOutboundEntryNoOps(agent: AgentDialplanAgentInput): string[] {
  return getAllowedOutboundDialplanPatterns(agent.outboundDialPermissions).map(({ pattern, label }) =>
    `exten => ${pattern},1,NoOp(Agent endpoint ${label} call ${agent.extension} / \${EXTEN})`,
  );
}

function buildAllowedOutboundEntryRoutes(agent: AgentDialplanAgentInput): string[] {
  return buildAllowedOutboundEntryNoOps(agent).flatMap((noOpLine) => [
    noOpLine,
    ...buildRegisteredEndpointGuard(agent),
    ` same => n,Goto(outbound-main-${agent.extension},\${EXTEN},1)`,
  ]);
}

function buildRegisteredEndpointGuard(agent: AgentDialplanAgentInput): string[] {
  return [
    ` same => n,GotoIf($["\${PJSIP_DIAL_CONTACTS(${agent.extension})}"=""]?unregistered-agent,1)`,
  ];
}

function buildAllowedOutboundRouteLines(permissions?: OutboundDialPermissions): string[] {
  return getAllowedOutboundDialplanPatterns(permissions).map(
    ({ pattern, label }) => `exten => ${pattern},1,NoOp(Outbound ${label} \${EXTEN})`,
  );
}

function getAllowedOutboundDialplanPatterns(permissionsInput?: OutboundDialPermissions) {
  const permissions = normalizeOutboundDialPermissions(permissionsInput);
  return [
    ...(permissions.international
      ? INTERNATIONAL_OUTBOUND_DIALPLAN_PATTERNS.map((pattern) => ({ pattern, label: 'international' }))
      : []),
    ...(permissions.paid
      ? PAID_OUTBOUND_DIALPLAN_PATTERNS.map((pattern) => ({ pattern, label: 'paid' }))
      : []),
    ...(permissions.representative
      ? REPRESENTATIVE_OUTBOUND_DIALPLAN_PATTERNS.map((pattern) => ({ pattern, label: 'representative' }))
      : []),
    ...(permissions.domestic
      ? DOMESTIC_OUTBOUND_DIALPLAN_PATTERNS.map((pattern) => ({ pattern, label: 'domestic' }))
      : []),
  ];
}

function buildOutboundNoServiceRoute(noOpLine: string): string[] {
  return [
    noOpLine,
    ' same => n,Playback(ss-noservice)',
    ' same => n,Hangup()',
  ];
}

function buildOutboundDialRoute(
  noOpLine: string,
  agent: AgentDialplanAgentInput,
  trunkDialTarget: string,
  callerId: string,
  cidRulesContextName: string | null,
  recordingChannelMode: RecordingChannelMode,
): string[] {
  const lines = [
    noOpLine,
    ...buildRecordFileLines(recordingChannelMode),
  ];
  if (cidRulesContextName) {
    // 룰 sub-context 가 CALLERID(num) / CALLERID(name) 을 set 후 Return.
    // sub-context 의 fallback 이 defaultCallerId 도 처리하므로 inline Set 은 제거.
    lines.push(` same => n,Gosub(${cidRulesContextName},\${EXTEN},1)`);
  } else {
    lines.push(` same => n,Set(CALLERID(num)=${callerId})`);
    lines.push(` same => n,Set(CALLERID(name)=${callerId})`);
  }
  lines.push(` same => n,Set(CALLERID(pres)=${agent.callerIdPrivacy})`);
  lines.push(` same => n,Dial(${trunkDialTarget},60,b(func-set-sipheaders^s^1)U(agent-pre-bridge))`);
  lines.push(' same => n,Hangup()');
  return lines;
}

function renderAgentSpeedDialLines(
  agent: AgentDialplanAgentInput,
  allowDirectSipDial: boolean,
  speedDials: AgentDialplanSpeedDialInput[],
): string[] {
  if (!allowDirectSipDial || !agent.outboundEnabled || agent.extensionLockMode === 'OUTBOUND_LOCKED' || agent.extensionLockMode === 'FULL_LOCKED') {
    return [];
  }

  return speedDials
    .filter((item) => item.enabled)
    .flatMap((item) => {
      assertNoNewlines(item.code, 'speedDialCode');
      assertNoNewlines(item.targetNumber, 'speedDialTargetNumber');
      const label = item.displayName ?? item.targetNumber;
      if (label) assertNoNewlines(label, 'speedDialDisplayName');
      const lines = [
        `exten => ${item.code},1,NoOp(Speed dial ${item.code} -> ${label})`,
        ...buildRegisteredEndpointGuard(agent),
      ];
      if (/^[12]\d{3}$/.test(item.targetNumber)) {
        lines.push(` same => n,Dial(PJSIP/${item.targetNumber},20,tTU(agent-pre-bridge))`);
        lines.push(' same => n,Hangup()');
      } else {
        lines.push(` same => n,Goto(outbound-main-${agent.extension},${item.targetNumber},1)`);
      }
      return lines;
    });
}

function renderAgentFeatureCodeLines(
  agent: AgentDialplanAgentInput,
  featureCodes: AgentDialplanFeatureCodeInput[],
): string[] {
  return featureCodes
    .filter((item) => item.enabled && item.code && isHandsetDialFeature(item.featureKey))
    .flatMap((item) => {
      const code = item.code as string;
      assertNoNewlines(code, 'featureCode');

      if (item.featureKey === 'pickup') {
        // 대상 채널 선택은 PBX 가 한다. pjsip.renderer 가 상담원 endpoint 에
        // named_pickup_group 을 이미 내보내므로 그룹 제한도 PBX 쪽에서 걸린다.
        // 당겨받은 뒤 생기는 BridgeEnter 를 SessionEngine 이 받아 세션에 반영한다.
        return [
          `exten => ${code},1,NoOp(Feature code pickup / agent ${agent.extension})`,
          ' same => n,Pickup()',
          ' same => n,Hangup()',
        ];
      }
      return [];
    });
}

function renderAgentEntryContext(
  agent: AgentDialplanAgentInput,
  allowDirectSipDial: boolean,
  speedDials: AgentDialplanSpeedDialInput[] = [],
  featureCodes: AgentDialplanFeatureCodeInput[] = [],
): string {
  const contextName = `agent-phone-${agent.extension}`;
  const lines = [
    `[${contextName}]`,
    ...buildBlockedOutboundDialLines(`agent ${agent.extension}`, agent.outboundDialPermissions),
  ];

  if (agent.extensionLockMode === 'FULL_LOCKED') {
    lines.length = 1;
    lines.push(`exten => _X.,1,NoOp(Agent endpoint ${agent.extension} is FULL_LOCKED)`);
    lines.push(' same => n,Playback(ss-noservice)');
    lines.push(' same => n,Hangup()');
    return lines.join('\n');
  }

  const permissions = normalizeOutboundDialPermissions(agent.outboundDialPermissions);
  const phoneDirectEnabled = permissions.phoneDirect && permissions.phoneDirectAllowedIps.length > 0;
  if (!allowDirectSipDial || !agent.outboundEnabled || !phoneDirectEnabled || agent.extensionLockMode === 'OUTBOUND_LOCKED') {
    if (agent.extensionLockMode === 'OUTBOUND_LOCKED') {
      lines.push(`exten => _X.,1,NoOp(Outbound disabled for agent ${agent.extension}: OUTBOUND_LOCKED)`);
    } else if (!permissions.phoneDirect) {
      lines.push(`exten => _X.,1,NoOp(Phone direct outbound disabled for agent ${agent.extension})`);
    } else if (permissions.phoneDirectAllowedIps.length === 0) {
      lines.push(`exten => _X.,1,NoOp(Phone direct outbound IP allowlist empty for agent ${agent.extension})`);
    }
    lines.push(...buildAllowedOutboundEntryNoOps(agent).flatMap((noOpLine) => buildOutboundNoServiceRoute(noOpLine)));
  } else {
    lines.push(...buildAllowedOutboundEntryRoutes(agent));
  }

  lines.push(...renderAgentSpeedDialLines(agent, allowDirectSipDial && phoneDirectEnabled, speedDials));
  // 기능코드는 외부 발신 권한과 무관하다. 인바운드 전용 상담원도 당겨받기는 해야 한다.
  // FULL_LOCKED 는 위에서 이미 early return 으로 걸러졌다.
  lines.push(...renderAgentFeatureCodeLines(agent, featureCodes));
  lines.push(`exten => _[12]XXX,1,NoOp(Internal endpoint call ${agent.extension} / \${EXTEN})`);
  lines.push(...buildRegisteredEndpointGuard(agent));
  lines.push(' same => n,Dial(PJSIP/${EXTEN},20,tTU(agent-pre-bridge))');
  lines.push(' same => n,Hangup()');
  lines.push(`exten => unregistered-agent,1,NoOp(Registered contact not found for agent ${agent.extension})`);
  lines.push(' same => n,Playback(ss-noservice)');
  lines.push(' same => n,Hangup()');
  return lines.join('\n');
}

function renderAgentOutboundRoute(
  agent: AgentDialplanAgentInput,
  trunkDialTarget: string | null,
  callerId: string | null,
  cidRulesContextName: string | null,
  recordingChannelMode: RecordingChannelMode,
): string {
  const contextName = `outbound-main-${agent.extension}`;
  const lines = [
    `[${contextName}]`,
    ...buildBlockedOutboundDialLines(`outbound-main ${agent.extension}`, agent.outboundDialPermissions),
  ];
  const routeNoOps = [
    ...buildAllowedOutboundRouteLines(agent.outboundDialPermissions),
  ];

  if (!trunkDialTarget || !callerId) {
    lines.push(...routeNoOps.flatMap((noOpLine) => buildOutboundNoServiceRoute(noOpLine)));
    return lines.join('\n');
  }

  assertNoNewlines(callerId, 'defaultOutboundCallerId');
  assertNoNewlines(trunkDialTarget, 'trunkDialTarget');

  lines.push(
    ...routeNoOps.flatMap((noOpLine) => buildOutboundDialRoute(
      noOpLine,
      agent,
      trunkDialTarget,
      callerId,
      cidRulesContextName,
      recordingChannelMode,
    )),
  );
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
  contextName: string,
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

  const lines = [`[${contextName}]`];
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

function getAgentCidContextName(agent: AgentDialplanAgentInput, hasBranchScopedRules: boolean) {
  return hasBranchScopedRules ? `outbound-cid-rules-${agent.extension}` : 'outbound-cid-rules';
}

function getAgentOutboundCidRules(
  agent: AgentDialplanAgentInput,
  rules: OutboundCallerIdRuleInput[],
) {
  const branchIds = new Set(agent.branchIds ?? []);
  return rules.filter((rule) => !rule.branchId || branchIds.has(rule.branchId));
}

function renderPreBridgeAgentBranch(
  agent: AgentDialplanAgentInput,
  recordingChannelMode: RecordingChannelMode,
): string {
  const lines = [
    `[agent-pre-bridge-${agent.extension}]`,
    'exten => s,1,NoOp(Agent pre-bridge handler)',
  ];

  if (agent.liveRecordingEnabled) {
    lines.push(` same => n,ExecIf($["\${LEN(\${REC_FILE})}"!="0"]?MixMonitor(\${REC_BASE_DIR}/\${REC_FILE},${getMixMonitorOptions(recordingChannelMode)}))`);
  }

  lines.push(' same => n,Return()');
  return lines.join('\n');
}

/**
 * 큐가 상담원에게 호를 넘기기 전에 거치는 곳.
 *
 * 큐 멤버가 `Local/{내선}@agent-offer` 라서 여기가 먼저 돈다. 여기서 응답하지 않는 한
 * 발신자는 큐에 남아 대기음을 계속 듣는다 — 상담원이 고민하는 동안 무음이 되지 않는다.
 */
function renderAgentOffer(
  agents: AgentDialplanAgentInput[],
  timeoutSeconds: number,
  recordingChannelMode: RecordingChannelMode,
): string {
  const offerFields = 'Extension: ${EXTEN},Caller: ${CALLERID(num)},Linkedid: ${CHANNEL(linkedid)}';

  return [
    `[${AGENT_OFFER_CONTEXT}]`,
    // Local/{내선}@agent-offer 의 device state 는 그 자체로는 알 수 없다. hint 가 없으면
    // 큐에게 항상 "쓸 수 있음" 으로 보여 ringinuse=no 가 무력해지고, 통화 중인
    // 상담원에게 또 전화가 간다.
    ...agents.map((agent) => `exten => ${agent.extension},hint,PJSIP/${agent.extension}`),
    'exten => _X.,1,NoOp(Agent offer to ${EXTEN})',
    // REC_FILE 은 발신자 채널에서 물려받는다. 중간에 끊기면 MixMonitor 가 빈 이름으로
    // 녹취를 쓰려 하고 그 통화 녹취가 통째로 사라진다.
    ...buildRecordFileLines(recordingChannelMode),
    ` same => n,UserEvent(KasterAgentOffer,Stage: offered,${offerFields})`,
    ` same => n,AGI(${AGENT_OFFER_AGI_PATH},\${EXTEN},${timeoutSeconds})`,
    ` same => n,UserEvent(KasterAgentOffer,Stage: result,Result: \${KASTER_OFFER_RESULT},${offerFields})`,
    // 명시적인 거절만 거절로 본다. AGI 가 아예 못 돌면 이 변수는 빈 문자열인데,
    // 그걸 거절로 보면 모든 상담원이 통과되고 아무도 전화를 못 받는다 — 콜센터가 통째로 멈춘다.
    // ABANDONED 는 다른 상담원이 먼저 받았다는 뜻이다. 여기 안 적으면 아래 Dial 로 떨어져,
    // 방금 호를 놓친 상담원의 전화기가 이미 끝난 통화로 울린다.
    ' same => n,GotoIf($["${KASTER_OFFER_RESULT}"="REJECT" | "${KASTER_OFFER_RESULT}"="TIMEOUT" | "${KASTER_OFFER_RESULT}"="ABANDONED"]?declined)',
    ' same => n,Dial(PJSIP/${EXTEN},20,tTU(agent-pre-bridge))',
    ' same => n,Hangup()',
    // 끊으면 Queue 가 다음 상담원으로 넘어간다.
    ' same => n(declined),Hangup()',
  ].join('\n');
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
  const recordingChannelMode = normalizeRecordingChannelMode(input.recordingChannelMode);
  const trunkDialTarget = getOutboundTrunkDialTarget(input.trunks, input.trunkGroups);
  const speedDials = input.speedDials ?? [];
  const featureCodes = input.featureCodes ?? [];
  const allowedCallerIdText = input.allowedOutboundCallerIds.length > 0
    ? input.allowedOutboundCallerIds.join(',')
    : 'none';

  const rules = input.outboundCallerIdRules ?? [];
  const hasUsableRules = rules.some(
    (r) => r.enabled && r.matchType !== 'REGEX',
  );
  const hasBranchScopedRules = rules.some((r) => r.enabled && !!r.branchId);
  const cidRuleContexts = hasUsableRules
    ? (
      hasBranchScopedRules
        ? input.agents
          .map((agent) => renderOutboundCidRules(
            getAgentCidContextName(agent, true),
            input.defaultOutboundCallerId,
            getAgentOutboundCidRules(agent, rules),
          ))
          .filter((context): context is string => Boolean(context))
        : [renderOutboundCidRules('outbound-cid-rules', input.defaultOutboundCallerId, rules)].filter((context): context is string => Boolean(context))
    )
    : [];

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
    ...buildRecordFileLines(recordingChannelMode),
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
    ...input.agents.map((agent) => renderAgentEntryContext(agent, input.allowDirectSipDial, speedDials, featureCodes)),
    ...input.agents.map((agent) =>
      renderAgentOutboundRoute(
        agent,
        trunkDialTarget,
        input.defaultOutboundCallerId,
        hasUsableRules ? getAgentCidContextName(agent, hasBranchScopedRules) : null,
        recordingChannelMode,
      ),
    ),
    fromQueue,
    renderAgentOffer(
      input.agents,
      // 범위 밖 값을 그대로 박으면 AGI 가 롱폴 검증에 걸려 400 을 받고, AGI 는 실패하면
      // ACCEPT 로 fail-open 한다 — 전 상담원이 묻지도 않고 자동 수락된다.
      clampAgentOfferTimeoutSeconds(input.offerTimeoutSeconds),
      recordingChannelMode,
    ),
    sipHeaderHook,
    renderPreBridgeDispatcher(input.agents),
    ...input.agents.map((agent) => renderPreBridgeAgentBranch(agent, recordingChannelMode)),
  ];

  sections.push(...cidRuleContexts);

  return sections.join('\n\n');
}
