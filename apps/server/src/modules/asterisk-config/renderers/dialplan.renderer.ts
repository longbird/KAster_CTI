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
  enabled: boolean;
}

export interface BlocklistEntryInput {
  id: string;
  phoneNumber: string;
  isActive: boolean;
}

function renderBlocklistChecks(blocklistEntries: BlocklistEntryInput[]): string[] {
  return blocklistEntries
    .filter((entry) => entry.isActive)
    .flatMap((entry) => {
      assertNoNewlines(entry.phoneNumber, 'blocklist.phoneNumber');
      return [
        ` same => n,GotoIf($["\${CALLERID(num)}"="${entry.phoneNumber}"]?blocked-ani,s,1)`,
      ];
    });
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
    assertNoNewlines(forwardingRule.targetValue, 'forwarding.targetValue');
    if (forwardingRule.forwardType === 'EXTENSION') {
      return [
        `exten => ${did.did},1,NoOp(Inbound DID \${EXTEN} -> forward extension ${forwardingRule.targetValue})`,
        ` same => n,Set(__ENTRY_DID=\${EXTEN})`,
        ...blocklistLines,
        ` same => n,Goto(from-queue,${forwardingRule.targetValue},1)`,
      ].join('\n');
    }
    if (forwardingRule.forwardType === 'QUEUE') {
      return [
        `exten => ${did.did},1,NoOp(Inbound DID \${EXTEN} -> forward queue ${forwardingRule.targetValue})`,
        ` same => n,Set(__ENTRY_DID=\${EXTEN})`,
        ...blocklistLines,
        ` same => n,Goto(queue-entry,${forwardingRule.targetValue},1)`,
      ].join('\n');
    }
    console.warn(`[DialplanRenderer] DID ${did.did} has unsupported forwarding type ${forwardingRule.forwardType} — skipped`);
    return null;
  }
  if (did.ivrMenuId) {
    const menu = ivrMenus.find((m) => m.id === did.ivrMenuId);
    if (!menu) {
      console.warn(`[DialplanRenderer] DID ${did.did} references ivrMenuId ${did.ivrMenuId} but no matching menu found — skipped`);
      return null;
    }
    const slug = toSlug(menu.name);
    if (!slug) throw new Error(`IVR menu name "${menu.name}" produces an empty slug`);
    return [
      `exten => ${did.did},1,NoOp(Inbound DID \${EXTEN})`,
      ` same => n,Set(__ENTRY_DID=\${EXTEN})`,
      ...blocklistLines,
      ` same => n,Goto(ivr-menu-${slug},s,1)`,
    ].join('\n');
  }
  if (did.directQueue) {
    assertNoNewlines(did.directQueue, 'directQueue');
    return [
      `exten => ${did.did},1,NoOp(Inbound DID \${EXTEN})`,
      ` same => n,Set(__ENTRY_DID=\${EXTEN})`,
      ...blocklistLines,
      ` same => n,Goto(queue-entry,${did.directQueue},1)`,
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
  const extensionsQueue = input.ivrMenus
    .filter((m) => m.entries.length > 0)
    .map(renderIvrMenu)
    .join('\n\n');

  return { extensionsInbound, extensionsQueue };
}
