import { assertNoNewlines, toSlug } from './renderer-utils';

export interface DidInput {
  id: string;
  did: string;
  description: string | null;
  ivrMenuId: string | null;
  directQueue: string | null;
  branchPromptKeys?: string[] | null;
  branchPromptQueueDelaySeconds?: number | null;
  branchPromptWaitForCompletion?: boolean | null;
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

const DEFAULT_QUEUE_TIMEOUT_SECONDS = 45;
const CUSTOM_SOUND_ABSOLUTE_PREFIX = '/var/lib/asterisk/sounds/custom/';

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

function renderDidExtension(
  did: DidInput,
  ivrMenus: IvrMenuInput[],
  forwardingRules: ForwardingRuleInput[],
  blocklistEntries: BlocklistEntryInput[],
): string | null {
  assertNoNewlines(did.did, 'did');
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
        ` same => n,Set(__ENTRY_DID=\${EXTEN})`,
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
        ` same => n,Set(__ENTRY_DID=\${EXTEN})`,
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
      ` same => n,Set(__ENTRY_DID=\${EXTEN})`,
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
  const lines: string[] = [`[ivr-menu-${slug}]`, `exten => s,1,Answer()`];
  if (menu.welcomePrompt) lines.push(` same => n,Playback(${toPlaybackTarget(menu.welcomePrompt)})`);
  if (menu.menuPrompt) lines.push(` same => n,Background(${toPlaybackTarget(menu.menuPrompt)})`);
  lines.push(` same => n,WaitExten(${menu.timeoutSecs})`);
  for (const entry of menu.entries) {
    lines.push(`exten => ${entry.digit},1,Goto(queue-entry,${entry.queueName},1)`);
  }
  lines.push(`exten => t,1,Playback(vm-goodbye)`);
  lines.push(` same => n,Hangup()`);
  return lines.join('\n');
}

export function renderDialplan(input: DialplanInput): DialplanOutput {
  const forwardingRules = input.forwardingRules ?? [];
  const blocklistEntries = input.blocklistEntries ?? [];
  const enabledDids = input.dids.filter((d) => d.enabled);
  const forwardingContexts = enabledDids
    .map((did) => {
      const rule = forwardingRules.find((item) => item.didId === did.id && item.enabled);
      return rule ? renderForwardingRuleContext(did, rule) : null;
    })
    .filter((lines): lines is string[] => lines !== null)
    .map((lines) => lines.join('\n'));
  const didLines = enabledDids
    .map((d) => renderDidExtension(d, input.ivrMenus, forwardingRules, blocklistEntries))
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

  const extensionsQueue = [queueEntry, ...input.ivrMenus
    .filter((m) => m.entries.length > 0)
    .map(renderIvrMenu), buildDynamicDispatchLines().join('\n')]
    .join('\n\n');

  return { extensionsInbound, extensionsQueue };
}
