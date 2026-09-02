import { FlowGraph } from '../../ars-flow/flow-graph.types';
import { renderArsFlow } from './ars-flow.renderer';
import { assertNoNewlines, shellQuote, toPlaybackTarget, toSlug } from './renderer-utils';
import {
  CUSTOM_SOUND_ABSOLUTE_PREFIX,
  OPT_OUT_HOOK_PATH,
  SMART_ARS_HOOK_PATH,
} from './hook-paths';
import {
  AGENT_OFFER_TIMEOUT_CONTEXT,
  clampAgentOfferTimeoutSeconds,
  DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS,
} from '../../../common/call-routing.constants';
import {
  getRecordingFileExtension,
  normalizeRecordingChannelMode,
  RecordingChannelMode,
} from './recording-mode';

const DEFAULT_QUEUE_TIMEOUT_SECONDS = 45;
const OPT_OUT_GUARDED_DIGIT_AGI_PATH = `${CUSTOM_SOUND_ABSOLUTE_PREFIX}kaster-guarded-digit.agi`;

// ss-noservice 는 Asterisk 가 기본 제공하는 영어 안내다("not in service"). 한국 고객에게
// 그것을 들려주면 안내가 틀렸을 뿐 아니라 무슨 일이 일어난 것인지 알 수 없다.
const BLOCKED_ANI_PROMPT = `${CUSTOM_SOUND_ABSOLUTE_PREFIX}blocked_ani`;
const OPT_OUT_FAILED_PROMPT = `${CUSTOM_SOUND_ABSOLUTE_PREFIX}optout_failed`;
const QUEUE_CONNECTING_PROMPT = `${CUSTOM_SOUND_ABSOLUTE_PREFIX}queue_connecting`;
const OPT_OUT_MODE_SOURCE_TYPE: Record<OptOutMode, string> = {
  IMMEDIATE_OPT_OUT: 'OPT_OUT_080_IMMEDIATE',
  DTMF_MENU: 'OPT_OUT_080_DTMF',
  SMART_OPT_OUT: 'OPT_OUT_080_SMART',
};

export type OptOutMode = 'IMMEDIATE_OPT_OUT' | 'DTMF_MENU' | 'SMART_OPT_OUT';
export type OptOutDtmfActionType = 'QUEUE_ROUTE' | 'REGISTER_OPT_OUT' | 'UNREGISTER_OPT_OUT' | 'SEND_SMS';
export type OptOutSmartActionType = 'REGISTER_OPT_OUT' | 'REENTER_NUMBER' | 'SEND_SMS' | 'HANGUP';
export type OptOutActionType = OptOutDtmfActionType | OptOutSmartActionType;
export type SmartArsActionType = 'QUEUE_ROUTE' | 'TRANSFER' | 'SEND_SMS' | 'OPT_OUT' | 'PLAY_PROMPT';

export interface OptOutDigitMappingInput {
  digit: string;
  actionType: OptOutActionType;
  queueName?: string | null;
  smsTemplateId?: string | null;
}

export interface OptOutDtmfMenuInput {
  timeoutSeconds: number;
  maxRetries: number;
  invalidPromptKey?: string | null;
  timeoutPromptKey?: string | null;
  mappings: OptOutDigitMappingInput[];
}

export interface OptOutSmartFlowInput {
  inputPromptKey?: string | null;
  reentryPromptKey?: string | null;
  sameNumberPromptKey?: string | null;
  confirmPrefixPromptKey?: string | null;
  confirmSuffixPromptKey?: string | null;
  confirmMenuPromptKey?: string | null;
  failurePromptKey?: string | null;
  finalPromptKey?: string | null;
  inputTimeoutSeconds: number;
  maxRetries: number;
  confirmationMappings: OptOutDigitMappingInput[];
}

export interface BranchOptOut080Input {
  enabled: boolean;
  tenantId: string;
  branchId: string | null;
  mode: OptOutMode;
  basePromptKey?: string | null;
  basePromptInputDelaySeconds?: number | null;
  completionPromptKey?: string | null;
  smsTemplateId?: string | null;
  dtmfMenu?: OptOutDtmfMenuInput | null;
  smartFlow?: OptOutSmartFlowInput | null;
}

export interface SmartArsActionInput {
  digit: string;
  actionType: SmartArsActionType;
  queueName?: string | null;
  transferNumber?: string | null;
  smsTemplateId?: string | null;
  promptKey?: string | null;
}

export interface BranchSmartArsInput {
  enabled: boolean;
  tenantId: string;
  branchId: string | null;
  guidePromptKey?: string | null;
  invalidPromptKey?: string | null;
  failPromptKey?: string | null;
  timeoutSeconds: number;
  maxRetries: number;
  actions: SmartArsActionInput[];
}

export interface DidInput {
  id: string;
  did: string;
  branchId?: string | null;
  description: string | null;
  ivrMenuId: string | null;
  directQueue: string | null;
  directExtension?: string | null;
  branchPromptKeys?: string[] | null;
  branchPromptQueueDelaySeconds?: number | null;
  branchPromptWaitForCompletion?: boolean | null;
  branchOptOut080?: BranchOptOut080Input | null;
  branchSmartArs?: BranchSmartArsInput | null;
  /**
   * ARS 플로우 빌더로 만든 그래프. 있으면 다른 세 갈래보다 **먼저** 탄다.
   * 기존 경로는 건드리지 않고 갈래만 앞에 추가한다 — 운영 중인 사이트가 DID 단위로 옮겨 탄다.
   */
  arsFlow?: ArsFlowRouteInput | null;
  enabled: boolean;
}

export interface ArsFlowRouteInput {
  tenantId: string;
  graph: FlowGraph;
}

export interface IvrEntryInput {
  id: string;
  tenantId: string;
  menuId: string;
  digit: string;
  label: string;
  queueName: string;
}

export interface IvrMenuInput {
  id: string;
  name: string;
  welcomePrompt: string | null;
  menuPrompt: string | null;
  timeoutSecs: number;
  entries: IvrEntryInput[];
}

export interface DialplanInput {
  dids: DidInput[];
  ivrMenus: IvrMenuInput[];
  recordingChannelMode?: RecordingChannelMode;
  forwardingRules?: ForwardingRuleInput[];
  queueOverflowRules?: QueueOverflowRuleInput[];
  /**
   * 큐별 제안 대기 시간. 값이 호를 따라가야 해서 여기서 심는다 —
   * `agent-offer` context 는 모든 큐가 함께 쓰므로 거기에는 큐가 무엇인지가 없다.
   */
  queueOfferTimeouts?: QueueOfferTimeoutInput[];
  blocklistEntries?: BlocklistEntryInput[];
  holidayRules?: HolidayRuleInput[];
}

export interface DialplanOutput {
  extensionsInbound: string;
  extensionsQueue: string;
}

export interface ForwardingRuleInput {
  id: string;
  didId: string;
  forwardType: string;
  targetValue: string;
  forwardTriggerMode?: string | null;
  queueWaitSeconds?: number | null;
  stickyCallbackWindowMinutes?: number | null;
  conditionType: string;
  timeStart: string | null;
  timeEnd: string | null;
  daysOfWeek: string | null;
  scheduleJson?: string | null;
  enabled: boolean;
}

export interface QueueOfferTimeoutInput {
  queueName: string;
  agentOfferTimeoutSeconds?: number | null;
}

export interface QueueOverflowRuleInput {
  id: string;
  queueName: string;
  triggerMode: string;
  waitSeconds: number | null;
  targetType: string;
  targetValue: string;
  resultCode?: string | null;
  enabled: boolean;
  priority?: number | null;
}

export interface HolidayRuleInput {
  holidayRuleId: string;
  branchId?: string | null;
  ruleType: string;
  holidayDate?: string | null;
  monthDay?: string | null;
  isActive: boolean;
}

interface ForwardingScheduleInput {
  conditionType: 'ALWAYS' | 'TIME_RANGE';
  timeStart: string | null;
  timeEnd: string | null;
  daysOfWeek: string[];
}

const WEEKDAY_CHAIN = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function nextWeekday(day: string): string {
  const idx = (WEEKDAY_CHAIN as readonly string[]).indexOf(day);
  if (idx < 0) return day;
  return WEEKDAY_CHAIN[(idx + 1) % WEEKDAY_CHAIN.length];
}

interface TimeWindowSlot {
  range: string;
  day: string;
}

function expandTimeWindow(timeStart: string, timeEnd: string, day: string): TimeWindowSlot[] {
  if (timeStart < timeEnd) {
    return [{ range: `${timeStart}-${timeEnd}`, day }];
  }
  return [
    { range: `${timeStart}-23:59`, day },
    { range: `00:00-${timeEnd}`, day: nextWeekday(day) },
  ];
}

export interface BlocklistEntryInput {
  id: string;
  matchType: string;
  phoneNumber: string;
  isActive: boolean;
}

function renderBlocklistChecks(blocklistEntries: BlocklistEntryInput[]): string[] {
  return blocklistEntries
    .filter((entry) => entry.isActive)
    .flatMap((entry) => {
      assertNoNewlines(entry.phoneNumber, 'blocklist.phoneNumber');
      if (entry.matchType === 'PREFIX') {
        const prefixLength = entry.phoneNumber.length;
        return [
          ` same => n,GotoIf($["\${CALLERID(num):0:${prefixLength}}"="${entry.phoneNumber}"]?blocked-ani,s,1)`,
        ];
      }
      return [` same => n,GotoIf($["\${CALLERID(num)}"="${entry.phoneNumber}"]?blocked-ani,s,1)`];
    });
}

function renderPromptPlaybackLines(promptKeys?: string[] | null): string[] {
  if (!promptKeys?.length) {
    return [];
  }

  const lines = [
    ' same => n,Answer()',
    ' same => n,Set(CHANNEL(language)=)',
  ];

  lines.push(...promptKeys
    .map((promptKey) => promptKey?.trim())
    .filter((promptKey): promptKey is string => Boolean(promptKey))
    .map((promptKey) => {
      return ` same => n,Playback(${toPlaybackTarget(promptKey)})`;
    }));

  return lines;
}

function buildPromptMohClassName(promptKey: string): string {
  const normalized = promptKey
    .replace(/^custom\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `branch-prompt-${normalized || 'default'}`;
}

function buildOptOutContextSuffix(did: DidInput): string {
  const normalized = did.id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'default';
}

function buildSmartArsContextSuffix(did: DidInput): string {
  return buildOptOutContextSuffix(did);
}

function normalizeOptionalArg(value: string | null | undefined): string {
  return value && value.trim() ? value.trim() : '-';
}

function buildOptOutHookCommand(action: 'register' | 'unregister' | 'sms'): string {
  const args = [
    shellQuote(action),
    shellQuote('${OPT_OUT_TENANT_ID}'),
    shellQuote('${OPT_OUT_BRANCH_ID}'),
    shellQuote('${ENTRY_DID}'),
    shellQuote('${REQUESTER_PHONE}'),
    shellQuote('${OPT_OUT_TARGET_PHONE}'),
    shellQuote('${OPT_OUT_SOURCE_TYPE}'),
    shellQuote('${OPT_OUT_SELECTED_SMS_TEMPLATE}'),
  ];

  return `${OPT_OUT_HOOK_PATH} ${args.join(' ')}`;
}

function buildSmartArsHookCommand(action: 'sms' | 'opt-out'): string {
  const args = [
    shellQuote(action),
    shellQuote('${SMART_ARS_TENANT_ID}'),
    shellQuote('${SMART_ARS_BRANCH_ID}'),
    shellQuote('${ENTRY_DID}'),
    shellQuote('${CALLERID(num)}'),
    shellQuote('${SMART_ARS_SELECTED_SMS_TEMPLATE}'),
  ];

  return `${SMART_ARS_HOOK_PATH} ${args.join(' ')}`;
}

function buildSmartArsUserEvent(fields: Record<string, string>): string {
  const body = Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join(',');
  return `UserEvent(KasterSmartArs,${body})`;
}

function renderPromptQueuePreludeLines(did: DidInput): string[] {
  const promptKey = did.branchPromptKeys?.[0]?.trim();
  if (!promptKey || did.branchPromptWaitForCompletion) {
    return [];
  }

  const delaySeconds = Math.max(0, Math.trunc(did.branchPromptQueueDelaySeconds ?? 0));
  const className = buildPromptMohClassName(promptKey);
  const lines = [
    ' same => n,Answer()',
    ' same => n,Set(CHANNEL(language)=)',
    ` same => n,Set(__QUEUE_PROMPT_MOH_CLASS=${className})`,
    ' same => n,Set(__QUEUE_PROMPT_KEEP_IN_QUEUE=1)',
  ];

  if (delaySeconds > 0) {
    lines.push(
      ' same => n,Set(__QUEUE_PROMPT_PRESTARTED=1)',
      ' same => n,Set(CHANNEL(musicclass)=${QUEUE_PROMPT_MOH_CLASS})',
      ' same => n,StartMusicOnHold(${QUEUE_PROMPT_MOH_CLASS})',
      ` same => n,Wait(${delaySeconds})`,
    );
  }

  return lines;
}

function renderPromptQueueDelayLines(delaySeconds?: number | null): string[] {
  if (!delaySeconds || delaySeconds <= 0) {
    return [];
  }

  return [` same => n,Wait(${Math.trunc(delaySeconds)})`];
}

function buildTargetGotoLines(forwardType: string, targetValue: string): string[] | null {
  assertNoNewlines(targetValue, 'forwarding.targetValue');
  if (forwardType === 'EXTENSION') {
    return [` same => n,Goto(from-queue,${targetValue},1)`];
  }
  if (forwardType === 'QUEUE') {
    return [` same => n,Goto(queue-entry,${targetValue},1)`];
  }
  if (forwardType === 'EXTERNAL_NUMBER' || forwardType === 'AI_CENTER') {
    return [` same => n,Goto(transfer-target,${targetValue},1)`];
  }
  return null;
}

function buildDynamicDispatchLines(): string[] {
  return [
    '[forward-dispatch]',
    'exten => s,1,NoOp(Forward Dispatch type=${FORWARD_TYPE} target=${FORWARD_TARGET})',
    ' same => n,ExecIf($["${LEN(${FORWARD_STICKY_KEY})}"!="0" & "${LEN(${FORWARD_TARGET})}"!="0"]?Set(DB(${FORWARD_STICKY_KEY})=${EPOCH}|${FORWARD_TARGET}|${FORWARD_TYPE}))',
    ' same => n,GotoIf($["${FORWARD_TYPE}"="EXTENSION"]?from-queue,${FORWARD_TARGET},1)',
    ' same => n,GotoIf($["${FORWARD_TYPE}"="QUEUE"]?queue-entry,${FORWARD_TARGET},1)',
    ' same => n,GotoIf($["${FORWARD_TYPE}"="EXTERNAL_NUMBER"]?transfer-target,${FORWARD_TARGET},1)',
    ' same => n,NoOp(Unsupported forward type ${FORWARD_TYPE})',
    ' same => n,Hangup()',
  ];
}

function normalizeQueueOverflowWaitSeconds(rule: QueueOverflowRuleInput): number {
  const waitSeconds = Math.trunc(rule.waitSeconds ?? DEFAULT_QUEUE_TIMEOUT_SECONDS);
  return Math.max(1, waitSeconds);
}

function renderQueueOverflowTimeoutContext(queueOverflowRules: QueueOverflowRuleInput[]): string {
  const lines = [
    '[queue-overflow-timeout]',
    'exten => _.,1,Return()',
  ];

  for (const rule of queueOverflowRules) {
    assertNoNewlines(rule.queueName, 'queueOverflow.queueName');
    lines.push(
      `exten => ${rule.queueName},1,Set(__QUEUE_TIMEOUT_SECS=${normalizeQueueOverflowWaitSeconds(rule)})`,
      ' same => n,Return()',
    );
  }

  return lines.join('\n');
}

/**
 * 큐별 제안 대기 시간을 채널에 심는다.
 *
 * `__` 로 두는 것이 요점이다. 큐가 상담원을 부를 때 만드는 `Local/{내선}@agent-offer` 채널은
 * 발신자 채널에서 <b>상속되는 변수만</b> 물려받는다. 이 값을 읽는 쪽이 바로 그 채널이라
 * 하나라도 밑줄을 빠뜨리면 대기 시간이 조용히 기본값으로 돌아간다.
 * (같은 길로 `__REC_FILE` 이 넘어가 녹취 경로가 정해진다.)
 */
function renderAgentOfferTimeoutContext(queues: QueueOfferTimeoutInput[]): string {
  const lines = [
    `[${AGENT_OFFER_TIMEOUT_CONTEXT}]`,
    'exten => _.,1,Return()',
  ];

  for (const queue of queues) {
    assertNoNewlines(queue.queueName, 'queueOfferTimeout.queueName');
    lines.push(
      `exten => ${queue.queueName},1,Set(__KASTER_OFFER_TIMEOUT=${clampAgentOfferTimeoutSeconds(queue.agentOfferTimeoutSeconds)})`,
      ' same => n,Return()',
    );
  }

  return lines.join('\n');
}

function renderQueueOverflowContext(queueOverflowRules: QueueOverflowRuleInput[]): string {
  const lines = [
    '[queue-overflow]',
    // 상대 경로로 부르면 Asterisk 가 언어 디렉터리(sounds/en/custom/) 밑에서 찾는다.
    // 우리는 sounds/custom/ 에 쓰므로 못 찾고, 발신자는 45초를 기다린 끝에 아무 말도 없이
    // 끊긴다. 로그에는 "발신자가 포기함" 으로만 남아 원인을 알 수 없다.
    `exten => _.,1,Playback(${CUSTOM_SOUND_ABSOLUTE_PREFIX}queue_timeout)`,
    ' same => n,Hangup()',
  ];

  for (const rule of queueOverflowRules) {
    assertNoNewlines(rule.queueName, 'queueOverflow.queueName');
    const targetLines = buildTargetGotoLines(rule.targetType, rule.targetValue);
    if (!targetLines) {
      console.warn(`[DialplanRenderer] Queue ${rule.queueName} has unsupported overflow target ${rule.targetType} — skipped`);
      continue;
    }
    const resultCode = rule.resultCode?.trim() || 'QUEUE_OVERFLOW';
    assertNoNewlines(resultCode, 'queueOverflow.resultCode');
    lines.push(
      `exten => ${rule.queueName},1,NoOp(Queue Overflow / ${rule.queueName} / ${resultCode})`,
      ...targetLines,
    );
  }

  return lines.join('\n');
}

function parseForwardingSchedules(forwardingRule: ForwardingRuleInput): ForwardingScheduleInput[] {
  if (forwardingRule.scheduleJson) {
    try {
      const parsed = JSON.parse(forwardingRule.scheduleJson) as Array<{
        conditionType: string;
        timeStart?: string | null;
        timeEnd?: string | null;
        daysOfWeek?: string[];
      }>;
      if (Array.isArray(parsed)) {
        return parsed
          .map<ForwardingScheduleInput>((item) => {
            if (item.conditionType === 'TIME_RANGE') {
              return {
                conditionType: 'TIME_RANGE',
                timeStart: item.timeStart ?? null,
                timeEnd: item.timeEnd ?? null,
                daysOfWeek: item.daysOfWeek ?? [],
              };
            }
            return {
              conditionType: 'ALWAYS',
              timeStart: null,
              timeEnd: null,
              daysOfWeek: [],
            };
          })
          .filter((item) =>
            item.conditionType === 'ALWAYS' ||
            (!!item.timeStart && !!item.timeEnd && item.daysOfWeek.length > 0),
          );
      }
    } catch {
      // fall back to legacy fields
    }
  }

  if (
    forwardingRule.conditionType === 'TIME_RANGE' &&
    forwardingRule.timeStart &&
    forwardingRule.timeEnd &&
    forwardingRule.daysOfWeek
  ) {
    return [
      {
        conditionType: 'TIME_RANGE',
        timeStart: forwardingRule.timeStart,
        timeEnd: forwardingRule.timeEnd,
        daysOfWeek: forwardingRule.daysOfWeek.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean),
      },
    ];
  }

  return [
    {
      conditionType: 'ALWAYS',
      timeStart: null,
      timeEnd: null,
      daysOfWeek: [],
    },
  ];
}

function buildHolidayMatchExpression(rule: HolidayRuleInput): string | null {
  if (rule.ruleType === 'ANNUAL' && rule.monthDay) {
    assertNoNewlines(rule.monthDay, 'holiday.monthDay');
    return `$["\${STRFTIME(\${EPOCH},,%m-%d)}"="${rule.monthDay}"]`;
  }

  if ((rule.ruleType === 'DATE' || rule.ruleType === 'WORKDAY_OVERRIDE') && rule.holidayDate) {
    assertNoNewlines(rule.holidayDate, 'holiday.holidayDate');
    return `$["\${STRFTIME(\${EPOCH},,%Y-%m-%d)}"="${rule.holidayDate}"]`;
  }

  return null;
}

function orderedHolidayRulesForDid(did: DidInput, holidayRules: HolidayRuleInput[]): HolidayRuleInput[] {
  const activeRules = holidayRules.filter((rule) => rule.isActive);
  const branchRules = did.branchId
    ? activeRules.filter((rule) => rule.branchId === did.branchId)
    : [];
  const tenantRules = activeRules.filter((rule) => !rule.branchId);

  return [
    ...branchRules.filter((rule) => rule.ruleType === 'WORKDAY_OVERRIDE'),
    ...branchRules.filter((rule) => rule.ruleType !== 'WORKDAY_OVERRIDE'),
    ...tenantRules.filter((rule) => rule.ruleType === 'WORKDAY_OVERRIDE'),
    ...tenantRules.filter((rule) => rule.ruleType !== 'WORKDAY_OVERRIDE'),
  ];
}

function renderHolidayForwardingLines(
  did: DidInput,
  forwardingRule: ForwardingRuleInput,
  holidayRules: HolidayRuleInput[],
): string[] {
  const orderedRules = orderedHolidayRulesForDid(did, holidayRules);
  if (orderedRules.length === 0) {
    return [];
  }

  const workdayLabel = `holiday-workday-${toSlug(did.id) || 'default'}`;
  const lines = orderedRules
    .map((rule) => {
      const match = buildHolidayMatchExpression(rule);
      if (!match) return null;
      if (rule.ruleType === 'WORKDAY_OVERRIDE') {
        return ` same => n,GotoIf(${match}?${workdayLabel})`;
      }
      return ` same => n,GotoIf(${match}?forwarding-rule-${forwardingRule.id},s,1)`;
    })
    .filter((line): line is string => line !== null);

  return lines.length > 0
    ? [...lines, ` same => n(${workdayLabel}),NoOp(Holiday routing checks complete)`]
    : [];
}

function renderDidFallbackRoute(did: DidInput, ivrMenus: IvrMenuInput[]): string[] | null {
  if (did.ivrMenuId) {
    const menu = ivrMenus.find((m) => m.id === did.ivrMenuId);
    if (!menu) {
      console.warn(`[DialplanRenderer] DID ${did.did} references ivrMenuId ${did.ivrMenuId} but no matching menu found — skipped`);
      return null;
    }
    const slug = toSlug(menu.name);
    if (!slug) throw new Error(`IVR menu name "${menu.name}" produces an empty slug`);
    return [` same => n,Goto(ivr-menu-${slug},s,1)`];
  }

  if (did.directQueue) {
    assertNoNewlines(did.directQueue, 'directQueue');
    return [` same => n,Goto(queue-entry,${did.directQueue},1)`];
  }

  if (did.directExtension) {
    assertNoNewlines(did.directExtension, 'directExtension');
    return [
      ` same => n,NoOp(Direct DID to extension ${did.directExtension})`,
      ` same => n,Dial(PJSIP/${did.directExtension},20,tTU(agent-pre-bridge))`,
      ' same => n,Hangup()',
    ];
  }

  return null;
}

function renderForwardingRuleContext(did: DidInput, forwardingRule: ForwardingRuleInput): string[] | null {
  const triggerMode = forwardingRule.forwardTriggerMode ?? 'IMMEDIATE';
  const lines = [
    `[forwarding-rule-${forwardingRule.id}]`,
    `exten => s,1,NoOp(Forwarding Rule ${forwardingRule.id} / DID ${did.did} / trigger=${triggerMode})`,
    ` same => n,Set(__FORWARD_TYPE=${forwardingRule.forwardType})`,
    ` same => n,Set(__FORWARD_TARGET=${forwardingRule.targetValue})`,
  ];

  if ((forwardingRule.stickyCallbackWindowMinutes ?? 0) > 0) {
    lines.push(
      ' same => n,Set(__FORWARD_STICKY_KEY=forward-sticky/${ENTRY_DID}/${CALLERID(num)})',
      ` same => n,Set(__FORWARD_STICKY_WINDOW_SECS=${(forwardingRule.stickyCallbackWindowMinutes ?? 0) * 60})`,
      ' same => n,Set(__FORWARD_STICKY_RECORD=${DB(${FORWARD_STICKY_KEY})})',
      ' same => n,GotoIf($["${LEN(${FORWARD_STICKY_RECORD})}"="0"]?trigger-route)',
      ' same => n,Set(__FORWARD_STICKY_TS=${CUT(FORWARD_STICKY_RECORD,|,1)})',
      ' same => n,Set(__FORWARD_STICKY_TARGET=${CUT(FORWARD_STICKY_RECORD,|,2)})',
      ' same => n,Set(__FORWARD_STICKY_TYPE=${CUT(FORWARD_STICKY_RECORD,|,3)})',
      ' same => n,GotoIf($["${LEN(${FORWARD_STICKY_TS})}"="0"]?trigger-route)',
      ' same => n,GotoIf($["${LEN(${FORWARD_STICKY_TARGET})}"="0"]?trigger-route)',
      ' same => n,GotoIf($[${MATH(${EPOCH}-${FORWARD_STICKY_TS},int)} <= ${FORWARD_STICKY_WINDOW_SECS}]?sticky-hit)',
      ' same => n(trigger-route),NoOp(No sticky forward hit)',
      ' same => n,Goto(trigger-route-continue)',
      ' same => n(sticky-hit),Set(__FORWARD_TARGET=${FORWARD_STICKY_TARGET})',
      ' same => n,ExecIf($["${LEN(${FORWARD_STICKY_TYPE})}"!="0"]?Set(__FORWARD_TYPE=${FORWARD_STICKY_TYPE}))',
      ' same => n,Goto(forward-dispatch,s,1)',
      ' same => n(trigger-route-continue),NoOp(Continue with trigger mode)',
    );
  } else {
    lines.push(' same => n(trigger-route),NoOp(Trigger mode without sticky override)');
  }

  if (triggerMode === 'AFTER_QUEUE_WAIT') {
    if (!did.directQueue) {
      console.warn(`[DialplanRenderer] DID ${did.did} has AFTER_QUEUE_WAIT forwarding but no directQueue — skipped`);
      return null;
    }
    lines.push(
      ' same => n,Set(__FORWARD_AFTER_QUEUE_ENABLED=1)',
      ` same => n,Set(__QUEUE_TIMEOUT_SECS=${forwardingRule.queueWaitSeconds ?? DEFAULT_QUEUE_TIMEOUT_SECONDS})`,
      ` same => n,Goto(queue-entry,${did.directQueue},1)`,
    );
    return lines;
  }

  if (triggerMode === 'SMART_NO_READY') {
    if (!did.directQueue) {
      console.warn(`[DialplanRenderer] DID ${did.did} has SMART_NO_READY forwarding but no directQueue — skipped`);
      return null;
    }
    lines.push(
      ' same => n,Set(__SMART_FORWARD_ENABLED=1)',
      ` same => n,Goto(queue-entry,${did.directQueue},1)`,
    );
    return lines;
  }

  lines.push(' same => n,Goto(forward-dispatch,s,1)');
  return lines;
}

function renderOptOutVariableLines(did: DidInput): string[] {
  const optOut = did.branchOptOut080;
  if (!optOut?.enabled) {
    return [];
  }

  const contextSuffix = buildOptOutContextSuffix(did);
  const lines = [
    ` same => n,Set(__OPT_OUT_CONTEXT_SUFFIX=${contextSuffix})`,
    ` same => n,Set(__OPT_OUT_TENANT_ID=${normalizeOptionalArg(optOut.tenantId)})`,
    ` same => n,Set(__OPT_OUT_BRANCH_ID=${normalizeOptionalArg(optOut.branchId)})`,
    ` same => n,Set(__OPT_OUT_MODE=${optOut.mode})`,
    ` same => n,Set(__OPT_OUT_SOURCE_TYPE=${OPT_OUT_MODE_SOURCE_TYPE[optOut.mode]})`,
    ` same => n,Set(__OPT_OUT_SMS_TEMPLATE=${normalizeOptionalArg(optOut.smsTemplateId)})`,
    ` same => n,Set(__OPT_OUT_BASE_PROMPT=${normalizeOptionalArg(optOut.basePromptKey ? toPlaybackTarget(optOut.basePromptKey) : null)})`,
    ` same => n,Set(__OPT_OUT_BASE_PROMPT_INPUT_DELAY=${Math.max(0, Math.trunc(optOut.basePromptInputDelaySeconds ?? 0))})`,
    ` same => n,Set(__OPT_OUT_COMPLETION_PROMPT=${normalizeOptionalArg(optOut.completionPromptKey ? toPlaybackTarget(optOut.completionPromptKey) : null)})`,
  ];

  if (optOut.mode === 'DTMF_MENU' && optOut.dtmfMenu) {
    lines.push(
      ` same => n,Set(__OPT_OUT_DTMF_TIMEOUT=${Math.max(1, Math.trunc(optOut.dtmfMenu.timeoutSeconds))})`,
      ` same => n,Set(__OPT_OUT_DTMF_MAX_RETRIES=${Math.max(0, Math.trunc(optOut.dtmfMenu.maxRetries))})`,
      ` same => n,Set(__OPT_OUT_DTMF_INVALID_PROMPT=${normalizeOptionalArg(optOut.dtmfMenu.invalidPromptKey ? toPlaybackTarget(optOut.dtmfMenu.invalidPromptKey) : null)})`,
      ` same => n,Set(__OPT_OUT_DTMF_TIMEOUT_PROMPT=${normalizeOptionalArg(optOut.dtmfMenu.timeoutPromptKey ? toPlaybackTarget(optOut.dtmfMenu.timeoutPromptKey) : null)})`,
    );

    for (const mapping of optOut.dtmfMenu.mappings) {
      lines.push(
        ` same => n,Set(__OPT_OUT_DTMF_ACTION_${mapping.digit}=${mapping.actionType})`,
        ` same => n,Set(__OPT_OUT_DTMF_QUEUE_${mapping.digit}=${normalizeOptionalArg(mapping.queueName)})`,
        ` same => n,Set(__OPT_OUT_DTMF_SMS_${mapping.digit}=${normalizeOptionalArg(mapping.smsTemplateId)})`,
      );
    }
  }

  if (optOut.mode === 'SMART_OPT_OUT' && optOut.smartFlow) {
    lines.push(
      ' same => n,Set(__OPT_OUT_SMART_END_DIGIT=#)',
      ` same => n,Set(__OPT_OUT_SMART_TIMEOUT=${Math.max(1, Math.trunc(optOut.smartFlow.inputTimeoutSeconds))})`,
      ` same => n,Set(__OPT_OUT_SMART_MAX_RETRIES=${Math.max(0, Math.trunc(optOut.smartFlow.maxRetries))})`,
      ` same => n,Set(__OPT_OUT_SMART_INPUT_PROMPT=${normalizeOptionalArg(optOut.smartFlow.inputPromptKey ? toPlaybackTarget(optOut.smartFlow.inputPromptKey) : null)})`,
      ` same => n,Set(__OPT_OUT_SMART_REENTRY_PROMPT=${normalizeOptionalArg(optOut.smartFlow.reentryPromptKey ? toPlaybackTarget(optOut.smartFlow.reentryPromptKey) : null)})`,
      ` same => n,Set(__OPT_OUT_SMART_SAME_NUMBER_PROMPT=${normalizeOptionalArg(optOut.smartFlow.sameNumberPromptKey ? toPlaybackTarget(optOut.smartFlow.sameNumberPromptKey) : null)})`,
      ` same => n,Set(__OPT_OUT_SMART_CONFIRM_PREFIX=${normalizeOptionalArg(optOut.smartFlow.confirmPrefixPromptKey ? toPlaybackTarget(optOut.smartFlow.confirmPrefixPromptKey) : null)})`,
      ` same => n,Set(__OPT_OUT_SMART_CONFIRM_SUFFIX=${normalizeOptionalArg(optOut.smartFlow.confirmSuffixPromptKey ? toPlaybackTarget(optOut.smartFlow.confirmSuffixPromptKey) : null)})`,
      ` same => n,Set(__OPT_OUT_SMART_CONFIRM_MENU=${normalizeOptionalArg(optOut.smartFlow.confirmMenuPromptKey ? toPlaybackTarget(optOut.smartFlow.confirmMenuPromptKey) : null)})`,
      ` same => n,Set(__OPT_OUT_SMART_FAILURE_PROMPT=${normalizeOptionalArg(optOut.smartFlow.failurePromptKey ? toPlaybackTarget(optOut.smartFlow.failurePromptKey) : null)})`,
      ` same => n,Set(__OPT_OUT_SMART_FINAL_PROMPT=${normalizeOptionalArg(optOut.smartFlow.finalPromptKey ? toPlaybackTarget(optOut.smartFlow.finalPromptKey) : null)})`,
    );

    for (const mapping of optOut.smartFlow.confirmationMappings) {
      lines.push(
        ` same => n,Set(__OPT_OUT_SMART_CONFIRM_ACTION_${mapping.digit}=${mapping.actionType})`,
        ` same => n,Set(__OPT_OUT_SMART_CONFIRM_SMS_${mapping.digit}=${normalizeOptionalArg(mapping.smsTemplateId)})`,
      );
    }
  }

  return lines;
}

function renderDidOptOutRoute(did: DidInput, blocklistEntries: BlocklistEntryInput[]): string {
  const blocklistLines = renderBlocklistChecks(blocklistEntries);
  const optOutLines = renderOptOutVariableLines(did);
  return [
    `exten => ${did.did},1,NoOp(Inbound DID \${EXTEN} -> 080 opt-out)`,
    ' same => n,Set(__ENTRY_DID=${EXTEN})',
    ...blocklistLines,
    ...optOutLines,
    ' same => n,Goto(080-optout-entry,${EXTEN},1)',
  ].join('\n');
}

function renderSmartArsVariableLines(did: DidInput): string[] {
  const smartArs = did.branchSmartArs;
  if (!smartArs?.enabled || smartArs.actions.length === 0) {
    return [];
  }

  const contextSuffix = buildSmartArsContextSuffix(did);
  return [
    ` same => n,Set(__SMART_ARS_CONTEXT_SUFFIX=${contextSuffix})`,
    ` same => n,Set(__SMART_ARS_TENANT_ID=${normalizeOptionalArg(smartArs.tenantId)})`,
    ` same => n,Set(__SMART_ARS_BRANCH_ID=${normalizeOptionalArg(smartArs.branchId)})`,
    ` same => n,Set(__SMART_ARS_TIMEOUT=${Math.max(1, Math.trunc(smartArs.timeoutSeconds))})`,
    ` same => n,Set(__SMART_ARS_MAX_RETRIES=${Math.max(0, Math.trunc(smartArs.maxRetries))})`,
  ];
}

function renderDidArsFlowRoute(
  did: DidInput,
  blocklistEntries: BlocklistEntryInput[],
): string | null {
  if (!did.arsFlow) return null;

  const slug = arsFlowContextSlug(did.arsFlow.graph);
  return [
    `exten => ${did.did},1,NoOp(Inbound DID \${EXTEN} -> ARS flow)`,
    ' same => n,Set(__ENTRY_DID=${EXTEN})',
    ...renderBlocklistChecks(blocklistEntries),
    ` same => n,Goto(ars-flow-${slug},s,1)`,
  ].join('\n');
}

/** 컴파일러와 **같은 규칙**으로 컨텍스트 이름을 만든다. 어긋나면 진입점이 허공을 가리킨다. */
function arsFlowContextSlug(graph: FlowGraph): string {
  const slug = toSlug(graph.name) || toSlug(graph.flowId);
  if (!slug) throw new Error('ARS flow has no usable name or id for a context slug');
  return slug;
}

function renderDidSmartArsRoute(
  did: DidInput,
  blocklistEntries: BlocklistEntryInput[],
): string | null {
  const smartArs = did.branchSmartArs;
  if (!smartArs?.enabled || smartArs.actions.length === 0) {
    return null;
  }

  const blocklistLines = renderBlocklistChecks(blocklistEntries);
  const smartArsLines = renderSmartArsVariableLines(did);
  const contextSuffix = buildSmartArsContextSuffix(did);

  return [
    `exten => ${did.did},1,NoOp(Inbound DID \${EXTEN} -> Smart ARS)`,
    ' same => n,Set(__ENTRY_DID=${EXTEN})',
    ...blocklistLines,
    ...smartArsLines,
    ` same => n,Goto(smart-ars-${contextSuffix},s,1)`,
  ].join('\n');
}

function renderDidStandardRoute(
  did: DidInput,
  ivrMenus: IvrMenuInput[],
  forwardingRules: ForwardingRuleInput[],
  blocklistEntries: BlocklistEntryInput[],
  holidayRules: HolidayRuleInput[],
): string | null {
  const blocklistLines = renderBlocklistChecks(blocklistEntries);
  const promptLines = did.branchPromptWaitForCompletion ? renderPromptPlaybackLines(did.branchPromptKeys) : [];
  const promptDelayLines = did.branchPromptWaitForCompletion
    ? renderPromptQueueDelayLines(did.branchPromptQueueDelaySeconds)
    : [];
  const promptQueuePreludeLines = did.directQueue ? renderPromptQueuePreludeLines(did) : [];
  const forwardingRule = forwardingRules.find((rule) => rule.didId === did.id && rule.enabled);
  if (forwardingRule) {
    const holidayForwardingLines = renderHolidayForwardingLines(did, forwardingRule, holidayRules);
    const schedules = parseForwardingSchedules(forwardingRule);
    if (schedules.some((item) => item.conditionType === 'ALWAYS')) {
      const forwardingContext = renderForwardingRuleContext(did, forwardingRule);
      if (!forwardingContext) {
        console.warn(`[DialplanRenderer] DID ${did.did} has unsupported forwarding type ${forwardingRule.forwardType} — skipped`);
        return null;
      }
      return [
        `exten => ${did.did},1,NoOp(Inbound DID \${EXTEN} -> forward ${forwardingRule.forwardType.toLowerCase()} ${forwardingRule.targetValue})`,
        ' same => n,Set(__ENTRY_DID=${EXTEN})',
        ...blocklistLines,
        ...promptQueuePreludeLines,
        ...promptLines,
        ...promptDelayLines,
        ...holidayForwardingLines,
        ` same => n,Goto(forwarding-rule-${forwardingRule.id},s,1)`,
      ].join('\n');
    }
    const schedulesToApply = schedules.filter((item) => item.conditionType === 'TIME_RANGE');
    const fallbackLines = renderDidFallbackRoute(did, ivrMenus);
    if (schedulesToApply.length > 0 && fallbackLines) {
      return [
        `exten => ${did.did},1,NoOp(Inbound DID \${EXTEN} -> conditional forward ${forwardingRule.targetValue})`,
        ' same => n,Set(__ENTRY_DID=${EXTEN})',
        ...blocklistLines,
        ...promptQueuePreludeLines,
        ...promptLines,
        ...promptDelayLines,
        ...holidayForwardingLines,
        ...schedulesToApply.flatMap((schedule) =>
          schedule.daysOfWeek.flatMap((day) =>
            expandTimeWindow(
              schedule.timeStart as string,
              schedule.timeEnd as string,
              day,
            ).map(
              (slot) =>
                ` same => n,GotoIfTime(${slot.range},${slot.day},*,*?forwarding-rule-${forwardingRule.id},s,1)`,
            ),
          ),
        ),
        ...fallbackLines,
      ].join('\n');
    }
  }
  const fallbackLines = renderDidFallbackRoute(did, ivrMenus);
  if (fallbackLines) {
    return [
      `exten => ${did.did},1,NoOp(Inbound DID \${EXTEN})`,
      ' same => n,Set(__ENTRY_DID=${EXTEN})',
      ...blocklistLines,
      ...promptQueuePreludeLines,
      ...promptLines,
      ...promptDelayLines,
      ...fallbackLines,
    ].join('\n');
  }
  console.warn(`[DialplanRenderer] DID ${did.did} has no routing target — skipped`);
  return null;
}

function renderDidExtension(
  did: DidInput,
  ivrMenus: IvrMenuInput[],
  forwardingRules: ForwardingRuleInput[],
  blocklistEntries: BlocklistEntryInput[],
  holidayRules: HolidayRuleInput[],
): string | null {
  assertNoNewlines(did.did, 'did');

  // 플로우가 걸린 DID 는 여기서 끝난다. 아래 세 갈래는 타지 않는다.
  const arsFlowRoute = renderDidArsFlowRoute(did, blocklistEntries);
  if (arsFlowRoute) {
    return arsFlowRoute;
  }

  if (did.branchOptOut080?.enabled) {
    return renderDidOptOutRoute(did, blocklistEntries);
  }

  const smartArsRoute = renderDidSmartArsRoute(did, blocklistEntries);
  if (smartArsRoute) {
    return smartArsRoute;
  }

  return renderDidStandardRoute(did, ivrMenus, forwardingRules, blocklistEntries, holidayRules);
}

function renderIvrMenu(menu: IvrMenuInput): string {
  const slug = toSlug(menu.name);
  if (!slug) throw new Error(`IVR menu name "${menu.name}" produces an empty slug`);
  if (menu.timeoutSecs <= 0) {
    throw new Error(`IVR menu "${menu.name}" has invalid timeoutSecs: ${menu.timeoutSecs}`);
  }
  if (menu.welcomePrompt) assertNoNewlines(menu.welcomePrompt, 'welcomePrompt');
  if (menu.menuPrompt) assertNoNewlines(menu.menuPrompt, 'menuPrompt');
  for (const entry of menu.entries) {
    assertNoNewlines(entry.digit, 'entry.digit');
    assertNoNewlines(entry.queueName, 'entry.queueName');
  }
  const lines: string[] = [`[ivr-menu-${slug}]`, 'exten => s,1,Answer()'];
  if (menu.welcomePrompt) lines.push(` same => n,Playback(${toPlaybackTarget(menu.welcomePrompt)})`);
  if (menu.menuPrompt) lines.push(` same => n,Background(${toPlaybackTarget(menu.menuPrompt)})`);
  lines.push(` same => n,WaitExten(${menu.timeoutSecs})`);
  for (const entry of menu.entries) {
    lines.push(`exten => ${entry.digit},1,Goto(queue-entry,${entry.queueName},1)`);
  }
  lines.push('exten => t,1,Playback(vm-goodbye)');
  lines.push(' same => n,Hangup()');
  return lines.join('\n');
}

function renderSmartArsAction(action: SmartArsActionInput, contextSuffix: string): string[] {
  assertNoNewlines(action.digit, 'smartArs.action.digit');
  assertNoNewlines(action.actionType, 'smartArs.action.actionType');
  const lines = [
    `exten => ${action.digit},1,NoOp(Smart ARS digit ${action.digit} action ${action.actionType})`,
    ` same => n,${buildSmartArsUserEvent({
      Stage: 'selection',
      Digit: action.digit,
      Action: action.actionType,
      Result: 'selected',
      TenantId: '${SMART_ARS_TENANT_ID}',
      BranchId: '${SMART_ARS_BRANCH_ID}',
      EntryDid: '${ENTRY_DID}',
      Caller: '${CALLERID(num)}',
      Linkedid: '${CHANNEL(linkedid)}',
    })}`,
  ];

  if (action.actionType === 'QUEUE_ROUTE') {
    if (!action.queueName) return [];
    assertNoNewlines(action.queueName, 'smartArs.action.queueName');
    lines.push(
      ` same => n,${buildSmartArsUserEvent({
        Stage: 'action',
        Digit: action.digit,
        Action: 'QUEUE_ROUTE',
        Target: action.queueName,
        Result: 'routed',
        TenantId: '${SMART_ARS_TENANT_ID}',
        BranchId: '${SMART_ARS_BRANCH_ID}',
        EntryDid: '${ENTRY_DID}',
        Caller: '${CALLERID(num)}',
        Linkedid: '${CHANNEL(linkedid)}',
      })}`,
      ` same => n,Goto(queue-entry,${action.queueName},1)`,
    );
    return lines;
  }

  if (action.actionType === 'TRANSFER') {
    if (!action.transferNumber) return [];
    assertNoNewlines(action.transferNumber, 'smartArs.action.transferNumber');
    lines.push(
      ` same => n,${buildSmartArsUserEvent({
        Stage: 'action',
        Digit: action.digit,
        Action: 'TRANSFER',
        Target: action.transferNumber,
        Result: 'transfer',
        TenantId: '${SMART_ARS_TENANT_ID}',
        BranchId: '${SMART_ARS_BRANCH_ID}',
        EntryDid: '${ENTRY_DID}',
        Caller: '${CALLERID(num)}',
        Linkedid: '${CHANNEL(linkedid)}',
      })}`,
      ` same => n,Goto(transfer-target,${action.transferNumber},1)`,
    );
    return lines;
  }

  if (action.actionType === 'SEND_SMS') {
    if (!action.smsTemplateId) return [];
    assertNoNewlines(action.smsTemplateId, 'smartArs.action.smsTemplateId');
    lines.push(
      ` same => n,Set(__SMART_ARS_SELECTED_SMS_TEMPLATE=${action.smsTemplateId})`,
      ` same => n,${buildSmartArsUserEvent({
        Stage: 'action',
        Digit: action.digit,
        Action: 'SEND_SMS',
        Target: action.smsTemplateId,
        Result: 'started',
        TenantId: '${SMART_ARS_TENANT_ID}',
        BranchId: '${SMART_ARS_BRANCH_ID}',
        EntryDid: '${ENTRY_DID}',
        Caller: '${CALLERID(num)}',
        Linkedid: '${CHANNEL(linkedid)}',
      })}`,
      ` same => n,System(${buildSmartArsHookCommand('sms')})`,
      ` same => n,${buildSmartArsUserEvent({
        Stage: 'result',
        Digit: action.digit,
        Action: 'SEND_SMS',
        Target: action.smsTemplateId,
        Result: '${SYSTEMSTATUS}',
        TenantId: '${SMART_ARS_TENANT_ID}',
        BranchId: '${SMART_ARS_BRANCH_ID}',
        EntryDid: '${ENTRY_DID}',
        Caller: '${CALLERID(num)}',
        Linkedid: '${CHANNEL(linkedid)}',
      })}`,
      ` same => n,GotoIf($["\${SYSTEMSTATUS}"!="SUCCESS"]?smart-ars-failure-${contextSuffix},s,1)`,
      ' same => n,Hangup()',
    );
    return lines;
  }

  if (action.actionType === 'OPT_OUT') {
    lines.push(
      ' same => n,Set(__SMART_ARS_SELECTED_SMS_TEMPLATE=-)',
      ` same => n,${buildSmartArsUserEvent({
        Stage: 'action',
        Digit: action.digit,
        Action: 'OPT_OUT',
        Result: 'started',
        TenantId: '${SMART_ARS_TENANT_ID}',
        BranchId: '${SMART_ARS_BRANCH_ID}',
        EntryDid: '${ENTRY_DID}',
        Caller: '${CALLERID(num)}',
        Linkedid: '${CHANNEL(linkedid)}',
      })}`,
      ` same => n,System(${buildSmartArsHookCommand('opt-out')})`,
      ` same => n,${buildSmartArsUserEvent({
        Stage: 'result',
        Digit: action.digit,
        Action: 'OPT_OUT',
        Result: '${SYSTEMSTATUS}',
        TenantId: '${SMART_ARS_TENANT_ID}',
        BranchId: '${SMART_ARS_BRANCH_ID}',
        EntryDid: '${ENTRY_DID}',
        Caller: '${CALLERID(num)}',
        Linkedid: '${CHANNEL(linkedid)}',
      })}`,
      ` same => n,GotoIf($["\${SYSTEMSTATUS}"!="SUCCESS"]?smart-ars-failure-${contextSuffix},s,1)`,
      ' same => n,Hangup()',
    );
    return lines;
  }

  if (action.actionType === 'PLAY_PROMPT') {
    if (!action.promptKey) return [];
    assertNoNewlines(action.promptKey, 'smartArs.action.promptKey');
    lines.push(
      ` same => n,${buildSmartArsUserEvent({
        Stage: 'action',
        Digit: action.digit,
        Action: 'PLAY_PROMPT',
        Target: toPlaybackTarget(action.promptKey),
        Result: 'started',
        TenantId: '${SMART_ARS_TENANT_ID}',
        BranchId: '${SMART_ARS_BRANCH_ID}',
        EntryDid: '${ENTRY_DID}',
        Caller: '${CALLERID(num)}',
        Linkedid: '${CHANNEL(linkedid)}',
      })}`,
      ` same => n,Playback(${toPlaybackTarget(action.promptKey)})`,
      ` same => n,${buildSmartArsUserEvent({
        Stage: 'result',
        Digit: action.digit,
        Action: 'PLAY_PROMPT',
        Target: toPlaybackTarget(action.promptKey),
        Result: 'played',
        TenantId: '${SMART_ARS_TENANT_ID}',
        BranchId: '${SMART_ARS_BRANCH_ID}',
        EntryDid: '${ENTRY_DID}',
        Caller: '${CALLERID(num)}',
        Linkedid: '${CHANNEL(linkedid)}',
      })}`,
      ' same => n,Hangup()',
    );
    return lines;
  }

  return [];
}

function renderSmartArsContext(did: DidInput): string | null {
  const smartArs = did.branchSmartArs;
  if (!smartArs?.enabled || smartArs.actions.length === 0) {
    return null;
  }

  const contextSuffix = buildSmartArsContextSuffix(did);
  const guidePrompt = smartArs.guidePromptKey ? toPlaybackTarget(smartArs.guidePromptKey) : null;
  const invalidPrompt = smartArs.invalidPromptKey ? toPlaybackTarget(smartArs.invalidPromptKey) : null;
  const failPrompt = smartArs.failPromptKey ? toPlaybackTarget(smartArs.failPromptKey) : 'ss-noservice';
  const actionLines = smartArs.actions.flatMap((action) => renderSmartArsAction(action, contextSuffix));

  if (actionLines.length === 0) {
    return null;
  }

  const lines = [
    `[smart-ars-${contextSuffix}]`,
    'exten => s,1,Answer()',
    ' same => n,Set(CHANNEL(language)=)',
    ' same => n,Set(__SMART_ARS_RETRY_COUNT=0)',
    ' same => n(loop),NoOp(Smart ARS wait / DID=${ENTRY_DID} / retry=${SMART_ARS_RETRY_COUNT})',
  ];

  if (guidePrompt) {
    lines.push(
      ` same => n,${buildSmartArsUserEvent({
        Stage: 'prompt',
        Prompt: guidePrompt,
        Result: 'started',
        TenantId: '${SMART_ARS_TENANT_ID}',
        BranchId: '${SMART_ARS_BRANCH_ID}',
        EntryDid: '${ENTRY_DID}',
        Caller: '${CALLERID(num)}',
        Linkedid: '${CHANNEL(linkedid)}',
      })}`,
      ` same => n,Background(${guidePrompt})`,
    );
  }
  lines.push(
    ' same => n,WaitExten(${SMART_ARS_TIMEOUT})',
    'exten => t,1,NoOp(Smart ARS timeout)',
    ` same => n,${buildSmartArsUserEvent({
      Stage: 'selection',
      Digit: 'timeout',
      Result: 'timeout',
      TenantId: '${SMART_ARS_TENANT_ID}',
      BranchId: '${SMART_ARS_BRANCH_ID}',
      EntryDid: '${ENTRY_DID}',
      Caller: '${CALLERID(num)}',
      Linkedid: '${CHANNEL(linkedid)}',
    })}`,
    ` same => n,Goto(smart-ars-retry-${contextSuffix},s,1)`,
    'exten => i,1,NoOp(Smart ARS invalid digit)',
  );
  if (invalidPrompt) {
    lines.push(
      ` same => n,${buildSmartArsUserEvent({
        Stage: 'selection',
        Digit: 'invalid',
        Result: 'invalid',
        TenantId: '${SMART_ARS_TENANT_ID}',
        BranchId: '${SMART_ARS_BRANCH_ID}',
        EntryDid: '${ENTRY_DID}',
        Caller: '${CALLERID(num)}',
        Linkedid: '${CHANNEL(linkedid)}',
      })}`,
      ` same => n,${buildSmartArsUserEvent({
        Stage: 'prompt',
        Prompt: invalidPrompt,
        Result: 'started',
        TenantId: '${SMART_ARS_TENANT_ID}',
        BranchId: '${SMART_ARS_BRANCH_ID}',
        EntryDid: '${ENTRY_DID}',
        Caller: '${CALLERID(num)}',
        Linkedid: '${CHANNEL(linkedid)}',
      })}`,
      ` same => n,Playback(${invalidPrompt})`,
    );
  }
  lines.push(
    ` same => n,Goto(smart-ars-retry-${contextSuffix},s,1)`,
    ...actionLines,
    '',
    `[smart-ars-retry-${contextSuffix}]`,
    'exten => s,1,Set(__SMART_ARS_RETRY_COUNT=$[${SMART_ARS_RETRY_COUNT}+1])',
    ` same => n,GotoIf($[\${SMART_ARS_RETRY_COUNT}<=\${SMART_ARS_MAX_RETRIES}]?smart-ars-${contextSuffix},s,loop)`,
    ` same => n,Goto(smart-ars-failure-${contextSuffix},s,1)`,
    '',
    `[smart-ars-failure-${contextSuffix}]`,
    'exten => s,1,NoOp(Smart ARS failure / DID=${ENTRY_DID})',
    ` same => n,${buildSmartArsUserEvent({
      Stage: 'result',
      Result: 'failure',
      TenantId: '${SMART_ARS_TENANT_ID}',
      BranchId: '${SMART_ARS_BRANCH_ID}',
      EntryDid: '${ENTRY_DID}',
      Caller: '${CALLERID(num)}',
      Linkedid: '${CHANNEL(linkedid)}',
    })}`,
    ` same => n,${buildSmartArsUserEvent({
      Stage: 'prompt',
      Prompt: failPrompt,
      Result: 'started',
      TenantId: '${SMART_ARS_TENANT_ID}',
      BranchId: '${SMART_ARS_BRANCH_ID}',
      EntryDid: '${ENTRY_DID}',
      Caller: '${CALLERID(num)}',
      Linkedid: '${CHANNEL(linkedid)}',
    })}`,
    ` same => n,Playback(${failPrompt})`,
    ' same => n,Hangup()',
  );

  return lines.join('\n');
}

function renderOptOutContexts(): string {
  return [
    '[080-optout-entry]',
    'exten => _X.,1,NoOp(080 Opt-Out Entry ${EXTEN})',
    ' same => n,Set(__ENTRY_DID=${EXTEN})',
    ' same => n,Answer()',
    ' same => n,Set(CHANNEL(language)=)',
    ' same => n,Set(__REQUESTER_PHONE=${FILTER(0-9,${CALLERID(num)})})',
    ' same => n,GotoIf($["${OPT_OUT_MODE}"="IMMEDIATE_OPT_OUT"]?immediate)',
    ' same => n,GotoIf($["${OPT_OUT_MODE}"="DTMF_MENU"]?080-optout-dtmf,s,1)',
    ' same => n,Goto(080-optout-smart-input,s,1)',
    ' same => n(immediate),ExecIf($["${OPT_OUT_BASE_PROMPT}"!="-" & "${LEN(${OPT_OUT_BASE_PROMPT})}"!="0"]?Playback(${OPT_OUT_BASE_PROMPT}))',
    ' same => n,Set(__OPT_OUT_TARGET_PHONE=${REQUESTER_PHONE})',
    ' same => n,Set(__OPT_OUT_SELECTED_ACTION=REGISTER_OPT_OUT)',
    ' same => n,Set(__OPT_OUT_SELECTED_SMS_TEMPLATE=${OPT_OUT_SMS_TEMPLATE})',
    ' same => n,Goto(080-optout-action,s,1)',
    '',
    '[080-optout-dtmf]',
    'exten => s,1,NoOp(080 Opt-Out DTMF / DID=${ENTRY_DID})',
    ' same => n,Set(__OPT_OUT_RETRY_COUNT=0)',
    ` same => n(read),AGI(${OPT_OUT_GUARDED_DIGIT_AGI_PATH},\${OPT_OUT_BASE_PROMPT},\${OPT_OUT_BASE_PROMPT_INPUT_DELAY},\${OPT_OUT_DTMF_TIMEOUT},0123456789)`,
    ' same => n,GotoIf($["${LEN(${OPT_OUT_DTMF_SELECTION})}"="0"]?timeout)',
    ' same => n,Goto(${OPT_OUT_DTMF_SELECTION},1)',
    ' same => n(timeout),ExecIf($["${OPT_OUT_DTMF_TIMEOUT_PROMPT}"!="-" & "${LEN(${OPT_OUT_DTMF_TIMEOUT_PROMPT})}"!="0"]?Playback(${OPT_OUT_DTMF_TIMEOUT_PROMPT}))',
    ' same => n,Goto(080-optout-dtmf-retry,s,1)',
    'exten => _[0-9],1,NoOp(080 Opt-Out DTMF Digit ${EXTEN})',
    ' same => n,Set(__OPT_OUT_SELECTED_ACTION=${OPT_OUT_DTMF_ACTION_${EXTEN}})',
    ' same => n,GotoIf($["${LEN(${OPT_OUT_SELECTED_ACTION})}"="0"]?080-optout-dtmf-invalid,s,1)',
    ' same => n,Set(__OPT_OUT_SELECTED_QUEUE=${OPT_OUT_DTMF_QUEUE_${EXTEN}})',
    ' same => n,Set(__OPT_OUT_SELECTED_SMS_TEMPLATE=${OPT_OUT_DTMF_SMS_${EXTEN}})',
    ' same => n,Set(__OPT_OUT_TARGET_PHONE=${REQUESTER_PHONE})',
    ' same => n,Goto(080-optout-action,s,1)',
    '',
    '[080-optout-dtmf-invalid]',
    'exten => s,1,NoOp(080 Opt-Out invalid DTMF selection)',
    ' same => n,ExecIf($["${OPT_OUT_DTMF_INVALID_PROMPT}"!="-" & "${LEN(${OPT_OUT_DTMF_INVALID_PROMPT})}"!="0"]?Playback(${OPT_OUT_DTMF_INVALID_PROMPT}))',
    ' same => n,Goto(080-optout-dtmf-retry,s,1)',
    '',
    '[080-optout-dtmf-retry]',
    'exten => s,1,Set(__OPT_OUT_RETRY_COUNT=$[${OPT_OUT_RETRY_COUNT}+1])',
    ' same => n,GotoIf($[${OPT_OUT_RETRY_COUNT}<=${OPT_OUT_DTMF_MAX_RETRIES}]?080-optout-dtmf,s,read)',
    ' same => n,Hangup()',
    '',
    '[080-optout-smart-input]',
    'exten => s,1,NoOp(080 Smart Opt-Out Input / DID=${ENTRY_DID})',
    ' same => n,Set(__OPT_OUT_SMART_INPUT_RETRY_COUNT=0)',
    ' same => n(read),NoOp(Smart opt-out end digit=${OPT_OUT_SMART_END_DIGIT})',
    ' same => n,ExecIf($[${OPT_OUT_SMART_INPUT_RETRY_COUNT}=0 & "${OPT_OUT_BASE_PROMPT}"!="-" & "${LEN(${OPT_OUT_BASE_PROMPT})}"!="0"]?Playback(${OPT_OUT_BASE_PROMPT}))',
    ' same => n,ExecIf($[${OPT_OUT_SMART_INPUT_RETRY_COUNT}>0 & "${OPT_OUT_SMART_REENTRY_PROMPT}"!="-" & "${LEN(${OPT_OUT_SMART_REENTRY_PROMPT})}"!="0"]?Playback(${OPT_OUT_SMART_REENTRY_PROMPT}))',
    ' same => n,ExecIf($[${OPT_OUT_SMART_INPUT_RETRY_COUNT}=0 & "${OPT_OUT_SMART_INPUT_PROMPT}"!="-" & "${LEN(${OPT_OUT_SMART_INPUT_PROMPT})}"!="0"]?Playback(${OPT_OUT_SMART_INPUT_PROMPT}))',
    ' same => n,Read(OPT_OUT_SMART_TARGET,,16,,1,${OPT_OUT_SMART_TIMEOUT})',
    ' same => n,Set(__OPT_OUT_TARGET_PHONE=${FILTER(0-9,${OPT_OUT_SMART_TARGET})})',
    ' same => n,GotoIf($["${LEN(${OPT_OUT_TARGET_PHONE})}"="0"]?retry)',
    ' same => n,GotoIf($["${OPT_OUT_TARGET_PHONE}"="${REQUESTER_PHONE}"]?080-optout-smart-same-number,s,1)',
    ' same => n,Goto(080-optout-smart-confirm,s,1)',
    ' same => n(retry),Goto(080-optout-smart-input-retry,s,1)',
    'exten => reenter,1,NoOp(Restart smart opt-out number entry)',
    ' same => n,Goto(080-optout-smart-input,s,read)',
    '',
    '[080-optout-smart-same-number]',
    'exten => s,1,NoOp(080 Smart Opt-Out Same Number Reject)',
    ' same => n,ExecIf($["${OPT_OUT_SMART_SAME_NUMBER_PROMPT}"!="-" & "${LEN(${OPT_OUT_SMART_SAME_NUMBER_PROMPT})}"!="0"]?Playback(${OPT_OUT_SMART_SAME_NUMBER_PROMPT}))',
    ' same => n,Goto(080-optout-smart-input,s,read)',
    '',
    '[080-optout-smart-input-retry]',
    'exten => s,1,Set(__OPT_OUT_SMART_INPUT_RETRY_COUNT=$[${OPT_OUT_SMART_INPUT_RETRY_COUNT}+1])',
    ' same => n,GotoIf($[${OPT_OUT_SMART_INPUT_RETRY_COUNT}<=${OPT_OUT_SMART_MAX_RETRIES}]?080-optout-smart-input,s,read)',
    ' same => n,ExecIf($["${OPT_OUT_SMART_FAILURE_PROMPT}"!="-" & "${LEN(${OPT_OUT_SMART_FAILURE_PROMPT})}"!="0"]?Playback(${OPT_OUT_SMART_FAILURE_PROMPT}))',
    ' same => n,Hangup()',
    '',
    '[080-optout-smart-confirm]',
    'exten => s,1,NoOp(080 Smart Opt-Out Confirm / DID=${ENTRY_DID} / TARGET=${OPT_OUT_TARGET_PHONE})',
    ' same => n,Set(__OPT_OUT_SMART_CONFIRM_RETRY_COUNT=0)',
    ' same => n(playback),ExecIf($["${OPT_OUT_SMART_CONFIRM_PREFIX}"!="-" & "${LEN(${OPT_OUT_SMART_CONFIRM_PREFIX})}"!="0"]?Playback(${OPT_OUT_SMART_CONFIRM_PREFIX}))',
    ' same => n,SayDigits(${OPT_OUT_TARGET_PHONE})',
    ' same => n,ExecIf($["${OPT_OUT_SMART_CONFIRM_SUFFIX}"!="-" & "${LEN(${OPT_OUT_SMART_CONFIRM_SUFFIX})}"!="0"]?Playback(${OPT_OUT_SMART_CONFIRM_SUFFIX}))',
    ' same => n,ExecIf($["${OPT_OUT_SMART_CONFIRM_MENU}"!="-" & "${LEN(${OPT_OUT_SMART_CONFIRM_MENU})}"!="0"]?Playback(${OPT_OUT_SMART_CONFIRM_MENU}))',
    ' same => n,Read(OPT_OUT_SMART_CONFIRM_DIGIT,,1,,1,${OPT_OUT_SMART_TIMEOUT})',
    ' same => n,GotoIf($["${LEN(${OPT_OUT_SMART_CONFIRM_DIGIT})}"="0"]?retry)',
    ' same => n,Goto(${OPT_OUT_SMART_CONFIRM_DIGIT},1)',
    ' same => n(retry),Goto(080-optout-smart-confirm-retry,s,1)',
    'exten => _[0-9],1,NoOp(080 Smart confirm digit ${EXTEN})',
    ' same => n,Set(__OPT_OUT_SELECTED_ACTION=${OPT_OUT_SMART_CONFIRM_ACTION_${EXTEN}})',
    ' same => n,GotoIf($["${LEN(${OPT_OUT_SELECTED_ACTION})}"="0"]?080-optout-smart-confirm-invalid,s,1)',
    ' same => n,Set(__OPT_OUT_SELECTED_SMS_TEMPLATE=${OPT_OUT_SMART_CONFIRM_SMS_${EXTEN}})',
    ' same => n,GotoIf($["${OPT_OUT_SELECTED_ACTION}"="REENTER_NUMBER"]?080-optout-smart-input,reenter,1)',
    ' same => n,GotoIf($["${OPT_OUT_SELECTED_ACTION}"="HANGUP"]?080-optout-result,s,1)',
    ' same => n,Goto(080-optout-action,s,1)',
    '',
    '[080-optout-smart-confirm-invalid]',
    'exten => s,1,NoOp(080 Smart confirm invalid selection)',
    ' same => n,Goto(080-optout-smart-confirm-retry,s,1)',
    '',
    '[080-optout-smart-confirm-retry]',
    'exten => s,1,Set(__OPT_OUT_SMART_CONFIRM_RETRY_COUNT=$[${OPT_OUT_SMART_CONFIRM_RETRY_COUNT}+1])',
    ' same => n,GotoIf($[${OPT_OUT_SMART_CONFIRM_RETRY_COUNT}<=${OPT_OUT_SMART_MAX_RETRIES}]?080-optout-smart-confirm,s,playback)',
    ' same => n,ExecIf($["${OPT_OUT_SMART_FAILURE_PROMPT}"!="-" & "${LEN(${OPT_OUT_SMART_FAILURE_PROMPT})}"!="0"]?Playback(${OPT_OUT_SMART_FAILURE_PROMPT}))',
    ' same => n,Hangup()',
    '',
    '[080-optout-action]',
    'exten => s,1,NoOp(080 Opt-Out Action ${OPT_OUT_SELECTED_ACTION} / DID=${ENTRY_DID})',
    ' same => n,Set(__OPT_OUT_TARGET_PHONE=${IF($["${LEN(${OPT_OUT_TARGET_PHONE})}"="0"]?${REQUESTER_PHONE}:${OPT_OUT_TARGET_PHONE})})',
    ' same => n,Set(__OPT_OUT_SELECTED_SMS_TEMPLATE=${IF($["${OPT_OUT_SELECTED_SMS_TEMPLATE}"="-" | "${LEN(${OPT_OUT_SELECTED_SMS_TEMPLATE})}"="0"]?${OPT_OUT_SMS_TEMPLATE}:${OPT_OUT_SELECTED_SMS_TEMPLATE})})',
    ' same => n,GotoIf($["${OPT_OUT_SELECTED_ACTION}"="QUEUE_ROUTE"]?queue-route)',
    ' same => n,GotoIf($["${OPT_OUT_SELECTED_ACTION}"="REGISTER_OPT_OUT"]?register)',
    ' same => n,GotoIf($["${OPT_OUT_SELECTED_ACTION}"="UNREGISTER_OPT_OUT"]?unregister)',
    ' same => n,GotoIf($["${OPT_OUT_SELECTED_ACTION}"="SEND_SMS"]?sms)',
    ' same => n,Goto(080-optout-result,s,1)',
    ' same => n(queue-route),Goto(queue-entry,${OPT_OUT_SELECTED_QUEUE},1)',
    ` same => n(register),System(${buildOptOutHookCommand('register')})`,
    ' same => n,GotoIf($["${SYSTEMSTATUS}"!="SUCCESS"]?080-optout-failure,s,1)',
    ' same => n,Goto(080-optout-result,s,1)',
    ` same => n(unregister),System(${buildOptOutHookCommand('unregister')})`,
    ' same => n,GotoIf($["${SYSTEMSTATUS}"!="SUCCESS"]?080-optout-failure,s,1)',
    ' same => n,Goto(080-optout-result,s,1)',
    ` same => n(sms),System(${buildOptOutHookCommand('sms')})`,
    ' same => n,GotoIf($["${SYSTEMSTATUS}"!="SUCCESS"]?080-optout-failure,s,1)',
    ' same => n,Goto(080-optout-result,s,1)',
    '',
    '[080-optout-result]',
    'exten => s,1,NoOp(080 Opt-Out Result)',
    ' same => n,Set(__OPT_OUT_RESULT_PROMPT=${IF($["${OPT_OUT_MODE}"="SMART_OPT_OUT"]?${OPT_OUT_SMART_FINAL_PROMPT}:${OPT_OUT_COMPLETION_PROMPT})})',
    ' same => n,ExecIf($["${OPT_OUT_RESULT_PROMPT}"!="-" & "${LEN(${OPT_OUT_RESULT_PROMPT})}"!="0"]?Playback(${OPT_OUT_RESULT_PROMPT}))',
    ' same => n,Hangup()',
    '',
    '[080-optout-failure]',
    'exten => s,1,NoOp(080 Opt-Out Failure / ACTION=${OPT_OUT_SELECTED_ACTION} / STATUS=${SYSTEMSTATUS})',
    ` same => n,Playback(${OPT_OUT_FAILED_PROMPT})`,
    ' same => n,Hangup()',
  ].join('\n');
}

/**
 * 플로우 컨텍스트를 IVR·Smart ARS 와 같은 파일(extensions_queue.conf)에 낸다.
 *
 * 여러 DID 가 같은 플로우를 가리킬 수 있으므로 컨텍스트는 **플로우당 한 번만** 낸다.
 * 두 번 내면 Asterisk 가 같은 컨텍스트를 중복 정의로 읽는다.
 */
function renderArsFlowContexts(enabledDids: DidInput[]): string[] {
  const rendered = new Map<string, string>();

  for (const did of enabledDids) {
    if (!did.arsFlow) continue;
    const slug = arsFlowContextSlug(did.arsFlow.graph);
    if (rendered.has(slug)) continue;

    rendered.set(slug, renderArsFlow({
      graph: did.arsFlow.graph,
      did: did.did,
      tenantId: did.arsFlow.tenantId,
      branchId: did.branchId ?? null,
    }));
  }

  return [...rendered.values()];
}

export function renderDialplan(input: DialplanInput): DialplanOutput {
  const recordingChannelMode = normalizeRecordingChannelMode(input.recordingChannelMode);
  const recordingFileExtension = getRecordingFileExtension(recordingChannelMode);
  const forwardingRules = input.forwardingRules ?? [];
  const queueOverflowRules = (input.queueOverflowRules ?? [])
    .filter((rule) => rule.enabled)
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  const blocklistEntries = input.blocklistEntries ?? [];
  const holidayRules = input.holidayRules ?? [];
  const enabledDids = input.dids.filter((d) => d.enabled);
  const forwardingContexts = enabledDids
    .filter((did) => !did.branchOptOut080?.enabled)
    .map((did) => {
      const rule = forwardingRules.find((item) => item.didId === did.id && item.enabled);
      return rule ? renderForwardingRuleContext(did, rule) : null;
    })
    .filter((lines): lines is string[] => lines !== null)
    .map((lines) => lines.join('\n'));
  const didLines = enabledDids
    .map((d) => renderDidExtension(d, input.ivrMenus, forwardingRules, blocklistEntries, holidayRules))
    .filter((line): line is string => line !== null);
  const smartArsContexts = enabledDids
    .map(renderSmartArsContext)
    .filter((line): line is string => line !== null);
  const arsFlowContexts = renderArsFlowContexts(enabledDids);

  const blockedAniContext = [
    '[blocked-ani]',
    'exten => s,1,NoOp(Blocked ANI ${CALLERID(num)})',
    ` same => n,Playback(${BLOCKED_ANI_PROMPT})`,
    ' same => n,Hangup()',
  ].join('\n');

  const extensionsInbound = [`[inbound-main]`, ...didLines, ...forwardingContexts, blockedAniContext].join('\n\n');
  const queueEntry = [
    '[queue-entry]',
    'exten => h,1,NoOp(Queue Entry Hangup)',
    ' same => n,Hangup()',
    'exten => _.,1,Set(__QUEUE_NAME=${EXTEN})',
    ' same => n,Goto(s,1)',
    'exten => s,1,ExecIf($["${LEN(${QUEUE_NAME})}"="0"]?Set(__QUEUE_NAME=${QUEUE_NAME}))',
    ' same => n,ExecIf($["${LEN(${QUEUE_NAME})}"="0"]?Set(__QUEUE_NAME=${EXTEN}))',
    ' same => n,NoOp(Queue Entry / ${QUEUE_NAME} / ${CHANNEL(linkedid)})',
    ' same => n,Gosub(queue-overflow-timeout,${QUEUE_NAME},1)',
    ` same => n,Gosub(${AGENT_OFFER_TIMEOUT_CONTEXT},\${QUEUE_NAME},1)`,
    // 큐에 값이 없거나 sub-context 를 못 타면 여기서 채운다. 빈 값을 그대로 흘리면 AGI 인자가
    // 비고, AGI 는 인자를 못 읽으면 기본값으로 떨어지긴 하지만 그 판단이 두 곳으로 갈린다.
    ` same => n,ExecIf($["\${LEN(\${KASTER_OFFER_TIMEOUT})}"="0"]?Set(__KASTER_OFFER_TIMEOUT=${DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS}))`,
    ` same => n,ExecIf($["\${LEN(\${QUEUE_TIMEOUT_SECS})}"="0"]?Set(__QUEUE_TIMEOUT_SECS=${DEFAULT_QUEUE_TIMEOUT_SECONDS}))`,
    ' same => n,ExecIf($["${LEN(${QUEUE_PROMPT_MOH_CLASS})}"!="0" & "${QUEUE_PROMPT_KEEP_IN_QUEUE}"="1" & "${QUEUE_PROMPT_PRESTARTED}"!="1"]?Set(CHANNEL(musicclass)=${QUEUE_PROMPT_MOH_CLASS}))',
    ' same => n,ExecIf($["${SMART_FORWARD_ENABLED}"="1"]?Set(__QUEUE_READY_COUNT=${QUEUE_MEMBER(${QUEUE_NAME},ready)}))',
    ' same => n,ExecIf($["${SMART_FORWARD_ENABLED}"="1" & "${QUEUE_READY_COUNT}"="0"]?Goto(forward-dispatch,s,1))',
    ` same => n,Set(__REC_FILE=\${STRFTIME(\${EPOCH},,%Y/%m/%d)}/\${CHANNEL(linkedid)}-\${UNIQUEID}.${recordingFileExtension})`,
    ' same => n,Set(__CALL_START_TS=${STRFTIME(${EPOCH},,%Y-%m-%d %H:%M:%S)})',
    // extensions.conf 에서 ; 는 주석의 시작이다. 이스케이프하지 않으면 이 줄이 거기서
    // 잘려 Set() 의 괄호와 ${} 가 짝을 잃고, 통화마다
    // "Error in extension logic (missing '}')" 가 찍히면서 CDR userfield 가 통째로 빈다.
    // 녹취 경로와 linkedid 를 CDR 로 역추적하는 경로가 조용히 끊긴다.
    ' same => n,Set(CDR(userfield)=linkedid=${CHANNEL(linkedid)}\\;queue=${QUEUE_NAME}\\;rec=${REC_FILE})',
    // 큐에 들어가면 곧바로 대기음이 시작된다. 발신자 입장에서는 자기 선택이 접수된
    // 것인지 알 수 없고, 음악만 나오니 잘못 걸린 줄 알고 끊는다.
    // 상담원 연결 선택뿐 아니라 큐로 바로 들어오는 DID 도 이 자리를 지나므로,
    // 여기 한 곳에 두면 경로를 빠뜨릴 일이 없다.
    ` same => n,Playback(${QUEUE_CONNECTING_PROMPT})`,
    ' same => n,Queue(${QUEUE_NAME},tT,,,${QUEUE_TIMEOUT_SECS},,,agent-pre-bridge)',
    ' same => n,NoOp(Queue Result: ${QUEUESTATUS})',
    ' same => n,Goto(queue-exit,s,1)',
    '',
    '[queue-exit]',
    'exten => s,1,NoOp(Queue Exit / STATUS=${QUEUESTATUS} / ABANDONED?=${ABANDONED})',
    ' same => n,ExecIf($["${QUEUESTATUS}"="TIMEOUT" & "${FORWARD_AFTER_QUEUE_ENABLED}"="1"]?Goto(forward-dispatch,s,1))',
    ' same => n,GotoIf($["${QUEUESTATUS}"="TIMEOUT"]?queue-overflow,${QUEUE_NAME},1)',
    ' same => n,Hangup()',
  ].join('\n');

  const extensionsQueue = [queueEntry, renderQueueOverflowTimeoutContext(queueOverflowRules), renderAgentOfferTimeoutContext(input.queueOfferTimeouts ?? []), renderQueueOverflowContext(queueOverflowRules), renderOptOutContexts(), ...input.ivrMenus
    .filter((m) => m.entries.length > 0)
    .map(renderIvrMenu), ...smartArsContexts, ...arsFlowContexts, buildDynamicDispatchLines().join('\n')]
    .join('\n\n');

  return { extensionsInbound, extensionsQueue };
}
