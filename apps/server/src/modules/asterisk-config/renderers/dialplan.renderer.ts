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
}

export interface DialplanOutput {
  extensionsInbound: string;
  extensionsQueue: string;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function renderDidExtension(did: DidInput, ivrMenus: IvrMenuInput[]): string | null {
  if (did.ivrMenuId) {
    const menu = ivrMenus.find((m) => m.id === did.ivrMenuId);
    if (!menu) {
      console.warn(`[DialplanRenderer] DID ${did.did} references ivrMenuId ${did.ivrMenuId} but no matching menu found — skipped`);
      return null;
    }
    const slug = toSlug(menu.name);
    return [
      `exten => ${did.did},1,NoOp(Inbound DID \${EXTEN})`,
      ` same => n,Set(__ENTRY_DID=\${EXTEN})`,
      ` same => n,Goto(ivr-menu-${slug},s,1)`,
    ].join('\n');
  }
  if (did.directQueue) {
    return [
      `exten => ${did.did},1,NoOp(Inbound DID \${EXTEN})`,
      ` same => n,Set(__ENTRY_DID=\${EXTEN})`,
      ` same => n,Goto(queue-entry,${did.directQueue},1)`,
    ].join('\n');
  }
  console.warn(`[DialplanRenderer] DID ${did.did} has neither ivrMenuId nor directQueue — skipped`);
  return null;
}

function renderIvrMenu(menu: IvrMenuInput): string {
  const slug = toSlug(menu.name);
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
  const enabledDids = input.dids.filter((d) => d.enabled);
  const didLines = enabledDids
    .map((d) => renderDidExtension(d, input.ivrMenus))
    .filter((line): line is string => line !== null);

  const extensionsInbound = [`[inbound-main]`, ...didLines].join('\n\n');
  const extensionsQueue = input.ivrMenus
    .filter((m) => m.entries.length > 0)
    .map(renderIvrMenu)
    .join('\n\n');

  return { extensionsInbound, extensionsQueue };
}
