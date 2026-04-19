import { assertNoNewlines, toSlug } from './renderer-utils';

export interface DidInput {
  id: string;
  did: string;
  description: string | null;
  ivrMenuId: string | null;
  directQueue: string | null;
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
  conditionType: string;
  timeStart: string | null;
  timeEnd: string | null;
  daysOfWeek: string | null;
  enabled: boolean;
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

function buildTargetGotoLines(forwardType: string, targetValue: string): string[] | null {
  assertNoNewlines(targetValue, 'forwarding.targetValue');
  if (forwardType === 'EXTENSION') {
    return [` same => n,Goto(from-queue,${targetValue},1)`];
  }
  if (forwardType === 'QUEUE') {
    return [` same => n,Goto(queue-entry,${targetValue},1)`];
  }
  return null;
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

function renderConditionalForwarding(
  did: DidInput,
  ivrMenus: IvrMenuInput[],
  forwardingRule: ForwardingRuleInput,
): string[] | null {
  if (
    forwardingRule.conditionType !== 'TIME_RANGE' ||
    !forwardingRule.timeStart ||
    !forwardingRule.timeEnd ||
    !forwardingRule.daysOfWeek
  ) {
    return null;
  }

  const targetGotoLines = buildTargetGotoLines(forwardingRule.forwardType, forwardingRule.targetValue);
  const fallbackLines = renderDidFallbackRoute(did, ivrMenus);
  if (!targetGotoLines || !fallbackLines) {
    console.warn(`[DialplanRenderer] DID ${did.did} has invalid conditional forwarding configuration — skipped`);
    return null;
  }

  const days = forwardingRule.daysOfWeek
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return [
    `exten => ${did.did},1,NoOp(Inbound DID \${EXTEN} -> conditional forward ${forwardingRule.targetValue})`,
    ` same => n,Set(__ENTRY_DID=\${EXTEN})`,
    ...days.map(
      (day) =>
        ` same => n,GotoIfTime(${forwardingRule.timeStart}-${forwardingRule.timeEnd},${day},*,*?${targetGotoLines[0].replace(' same => n,Goto(', '').replace(')', '')})`,
    ),
    ...fallbackLines,
  ];
}

function renderDidExtension(
  did: DidInput,
  ivrMenus: IvrMenuInput[],
  forwardingRules: ForwardingRuleInput[],
  blocklistEntries: BlocklistEntryInput[],
): string | null {
  assertNoNewlines(did.did, 'did');
  const blocklistLines = renderBlocklistChecks(blocklistEntries);
  const forwardingRule = forwardingRules.find((rule) => rule.didId === did.id && rule.enabled);
  if (forwardingRule) {
    const conditionalLines = renderConditionalForwarding(did, ivrMenus, forwardingRule);
    if (conditionalLines) {
      return [...conditionalLines.slice(0, 2), ...blocklistLines, ...conditionalLines.slice(2)].join('\n');
    }
    const targetGotoLines = buildTargetGotoLines(forwardingRule.forwardType, forwardingRule.targetValue);
    if (!targetGotoLines) {
      console.warn(`[DialplanRenderer] DID ${did.did} has unsupported forwarding type ${forwardingRule.forwardType} — skipped`);
      return null;
    }
    return [
      `exten => ${did.did},1,NoOp(Inbound DID \${EXTEN} -> forward ${forwardingRule.forwardType.toLowerCase()} ${forwardingRule.targetValue})`,
      ` same => n,Set(__ENTRY_DID=\${EXTEN})`,
      ...blocklistLines,
      ...targetGotoLines,
    ].join('\n');
  }
  const fallbackLines = renderDidFallbackRoute(did, ivrMenus);
  if (fallbackLines) {
    return [
      `exten => ${did.did},1,NoOp(Inbound DID \${EXTEN})`,
      ` same => n,Set(__ENTRY_DID=\${EXTEN})`,
      ...blocklistLines,
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
  if (menu.welcomePrompt) lines.push(` same => n,Playback(${menu.welcomePrompt})`);
  if (menu.menuPrompt) lines.push(` same => n,Background(${menu.menuPrompt})`);
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
  const didLines = enabledDids
    .map((d) => renderDidExtension(d, input.ivrMenus, forwardingRules, blocklistEntries))
    .filter((line): line is string => line !== null);

  const blockedAniContext = [
    '[blocked-ani]',
    'exten => s,1,NoOp(Blocked ANI ${CALLERID(num)})',
    ' same => n,Playback(ss-noservice)',
    ' same => n,Hangup()',
  ].join('\n');

  const extensionsInbound = [`[inbound-main]`, ...didLines, blockedAniContext].join('\n\n');
  const queueEntry = [
    '[queue-entry]',
    'exten => s,1,NoOp(Queue Entry / ${QUEUE_NAME} / ${CHANNEL(linkedid)})',
    ' same => n,Set(__REC_FILE=${STRFTIME(${EPOCH},,%Y/%m/%d)}/${CHANNEL(linkedid)}-${UNIQUEID}.wav)',
    ' same => n,Set(__CALL_START_TS=${STRFTIME(${EPOCH},,%Y-%m-%d %H:%M:%S)})',
    ' same => n,Set(CDR(userfield)=linkedid=${CHANNEL(linkedid)};queue=${QUEUE_NAME};rec=${REC_FILE})',
    ' same => n,Queue(${QUEUE_NAME},tT,,,45,,,agent-pre-bridge)',
    ' same => n,NoOp(Queue Result: ${QUEUESTATUS})',
    ' same => n,Goto(queue-exit,s,1)',
    '',
    '[queue-exit]',
    'exten => s,1,NoOp(Queue Exit / STATUS=${QUEUESTATUS} / ABANDONED?=${ABANDONED})',
    ' same => n,ExecIf($["${QUEUESTATUS}"="TIMEOUT"]?Playback(custom/queue_timeout))',
    ' same => n,Hangup()',
  ].join('\n');

  const extensionsQueue = [queueEntry, ...input.ivrMenus
    .filter((m) => m.entries.length > 0)
    .map(renderIvrMenu)]
    .join('\n\n');

  return { extensionsInbound, extensionsQueue };
}
