import { assertNoNewlines, toSlug } from './renderer-utils';

const DEFAULT_QUEUE_TIMEOUT_SECONDS = 45;
const CUSTOM_SOUND_ABSOLUTE_PREFIX = '/var/lib/asterisk/sounds/custom/';
const OPT_OUT_HOOK_PATH = `${CUSTOM_SOUND_ABSOLUTE_PREFIX}kaster-opt-out-hook.sh`;
const OPT_OUT_GUARDED_DIGIT_AGI_PATH = `${CUSTOM_SOUND_ABSOLUTE_PREFIX}kaster-guarded-digit.agi`;
const SMART_ARS_HOOK_PATH = `${CUSTOM_SOUND_ABSOLUTE_PREFIX}kaster-smart-ars-hook.sh`;
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
  description: string | null;
  ivrMenuId: string | null;
  directQueue: string | null;
  branchPromptKeys?: string[] | null;
  branchPromptQueueDelaySeconds?: number | null;
  branchPromptWaitForCompletion?: boolean | null;
  branchOptOut080?: BranchOptOut080Input | null;
  branchSmartArs?: BranchSmartArsInput | null;
  enabled: boolean;
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
  forwardingRules?: ForwardingRuleInput[];
  blocklistEntries?: BlocklistEntryInput[];
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

interface ForwardingScheduleInput {
  conditionType: 'ALWAYS' | 'TIME_RANGE';
  timeStart: string | null;
  timeEnd: string | null;
  daysOfWeek: string[];
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

function toPlaybackTarget(promptKey: string): string {
  assertNoNewlines(promptKey, 'promptKey');
  if (promptKey.startsWith('custom/')) {
    const relativePath = promptKey.slice('custom/'.length);
    assertNoNewlines(relativePath, 'promptKey');
    return `${CUSTOM_SOUND_ABSOLUTE_PREFIX}${relativePath}`;
  }
  return promptKey;
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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
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
  if (forwardType === 'EXTERNAL_NUMBER') {
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
): string | null {
  const blocklistLines = renderBlocklistChecks(blocklistEntries);
  const promptLines = did.branchPromptWaitForCompletion ? renderPromptPlaybackLines(did.branchPromptKeys) : [];
  const promptDelayLines = did.branchPromptWaitForCompletion
    ? renderPromptQueueDelayLines(did.branchPromptQueueDelaySeconds)
    : [];
  const promptQueuePreludeLines = did.directQueue ? renderPromptQueuePreludeLines(did) : [];
  const forwardingRule = forwardingRules.find((rule) => rule.didId === did.id && rule.enabled);
  if (forwardingRule) {
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
        ...schedulesToApply.flatMap((schedule) =>
          schedule.daysOfWeek.map(
            (day) =>
              ` same => n,GotoIfTime(${schedule.timeStart}-${schedule.timeEnd},${day},*,*?forwarding-rule-${forwardingRule.id},s,1)`,
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
  console.warn(`[DialplanRenderer] DID ${did.did} has neither ivrMenuId nor directQueue — skipped`);
  return null;
}

function renderDidExtension(
  did: DidInput,
  ivrMenus: IvrMenuInput[],
  forwardingRules: ForwardingRuleInput[],
  blocklistEntries: BlocklistEntryInput[],
): string | null {
  assertNoNewlines(did.did, 'did');
  if (did.branchOptOut080?.enabled) {
    return renderDidOptOutRoute(did, blocklistEntries);
  }

  const smartArsRoute = renderDidSmartArsRoute(did, blocklistEntries);
  if (smartArsRoute) {
    return smartArsRoute;
  }

  return renderDidStandardRoute(did, ivrMenus, forwardingRules, blocklistEntries);
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
  ];

  if (action.actionType === 'QUEUE_ROUTE') {
    if (!action.queueName) return [];
    assertNoNewlines(action.queueName, 'smartArs.action.queueName');
    lines.push(` same => n,Goto(queue-entry,${action.queueName},1)`);
    return lines;
  }

  if (action.actionType === 'TRANSFER') {
    if (!action.transferNumber) return [];
    assertNoNewlines(action.transferNumber, 'smartArs.action.transferNumber');
    lines.push(` same => n,Goto(transfer-target,${action.transferNumber},1)`);
    return lines;
  }

  if (action.actionType === 'SEND_SMS') {
    if (!action.smsTemplateId) return [];
    assertNoNewlines(action.smsTemplateId, 'smartArs.action.smsTemplateId');
    lines.push(
      ` same => n,Set(__SMART_ARS_SELECTED_SMS_TEMPLATE=${action.smsTemplateId})`,
      ` same => n,System(${buildSmartArsHookCommand('sms')})`,
      ` same => n,GotoIf($["\${SYSTEMSTATUS}"!="SUCCESS"]?smart-ars-failure-${contextSuffix},s,1)`,
      ' same => n,Hangup()',
    );
    return lines;
  }

  if (action.actionType === 'OPT_OUT') {
    lines.push(
      ' same => n,Set(__SMART_ARS_SELECTED_SMS_TEMPLATE=-)',
      ` same => n,System(${buildSmartArsHookCommand('opt-out')})`,
      ` same => n,GotoIf($["\${SYSTEMSTATUS}"!="SUCCESS"]?smart-ars-failure-${contextSuffix},s,1)`,
      ' same => n,Hangup()',
    );
    return lines;
  }

  if (action.actionType === 'PLAY_PROMPT') {
    if (!action.promptKey) return [];
    assertNoNewlines(action.promptKey, 'smartArs.action.promptKey');
    lines.push(
      ` same => n,Playback(${toPlaybackTarget(action.promptKey)})`,
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
    lines.push(` same => n,Background(${guidePrompt})`);
  }
  lines.push(
    ' same => n,WaitExten(${SMART_ARS_TIMEOUT})',
    'exten => t,1,NoOp(Smart ARS timeout)',
    ` same => n,Goto(smart-ars-retry-${contextSuffix},s,1)`,
    'exten => i,1,NoOp(Smart ARS invalid digit)',
  );
  if (invalidPrompt) {
    lines.push(` same => n,Playback(${invalidPrompt})`);
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
    ' same => n,Goto(read)',
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
    ' same => n,Playback(ss-noservice)',
    ' same => n,Hangup()',
  ].join('\n');
}

export function renderDialplan(input: DialplanInput): DialplanOutput {
  const forwardingRules = input.forwardingRules ?? [];
  const blocklistEntries = input.blocklistEntries ?? [];
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
    .map((d) => renderDidExtension(d, input.ivrMenus, forwardingRules, blocklistEntries))
    .filter((line): line is string => line !== null);
  const smartArsContexts = enabledDids
    .map(renderSmartArsContext)
    .filter((line): line is string => line !== null);

  const blockedAniContext = [
    '[blocked-ani]',
    'exten => s,1,NoOp(Blocked ANI ${CALLERID(num)})',
    ' same => n,Playback(ss-noservice)',
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
    ` same => n,ExecIf($["\${LEN(\${QUEUE_TIMEOUT_SECS})}"="0"]?Set(__QUEUE_TIMEOUT_SECS=${DEFAULT_QUEUE_TIMEOUT_SECONDS}))`,
    ' same => n,ExecIf($["${LEN(${QUEUE_PROMPT_MOH_CLASS})}"!="0" & "${QUEUE_PROMPT_KEEP_IN_QUEUE}"="1" & "${QUEUE_PROMPT_PRESTARTED}"!="1"]?Set(CHANNEL(musicclass)=${QUEUE_PROMPT_MOH_CLASS}))',
    ' same => n,ExecIf($["${SMART_FORWARD_ENABLED}"="1"]?Set(__QUEUE_READY_COUNT=${QUEUE_MEMBER(${QUEUE_NAME},ready)}))',
    ' same => n,ExecIf($["${SMART_FORWARD_ENABLED}"="1" & "${QUEUE_READY_COUNT}"="0"]?Goto(forward-dispatch,s,1))',
    ' same => n,Set(__REC_FILE=${STRFTIME(${EPOCH},,%Y/%m/%d)}/${CHANNEL(linkedid)}-${UNIQUEID}.wav)',
    ' same => n,Set(__CALL_START_TS=${STRFTIME(${EPOCH},,%Y-%m-%d %H:%M:%S)})',
    ' same => n,Set(CDR(userfield)=linkedid=${CHANNEL(linkedid)};queue=${QUEUE_NAME};rec=${REC_FILE})',
    ' same => n,Queue(${QUEUE_NAME},tT,,,${QUEUE_TIMEOUT_SECS},,,agent-pre-bridge)',
    ' same => n,NoOp(Queue Result: ${QUEUESTATUS})',
    ' same => n,Goto(queue-exit,s,1)',
    '',
    '[queue-exit]',
    'exten => s,1,NoOp(Queue Exit / STATUS=${QUEUESTATUS} / ABANDONED?=${ABANDONED})',
    ' same => n,ExecIf($["${QUEUESTATUS}"="TIMEOUT" & "${FORWARD_AFTER_QUEUE_ENABLED}"="1"]?Goto(forward-dispatch,s,1))',
    ' same => n,ExecIf($["${QUEUESTATUS}"="TIMEOUT"]?Playback(custom/queue_timeout))',
    ' same => n,Hangup()',
  ].join('\n');

  const extensionsQueue = [queueEntry, renderOptOutContexts(), ...input.ivrMenus
    .filter((m) => m.entries.length > 0)
    .map(renderIvrMenu), ...smartArsContexts, buildDynamicDispatchLines().join('\n')]
    .join('\n\n');

  return { extensionsInbound, extensionsQueue };
}
