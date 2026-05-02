# Desktop Contextual Console Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the desktop agent UI with a state-driven contextual console that shows only the actions needed for the current call state, resizes the Electron window per state, supports registered outbound caller IDs, internal calls via agent list, call-history popup, and light/dark themes.

**Architecture:** Add pure console state/window-mode helpers first, then extend desktop IPC/main-process window handling, then refactor `SoftphoneShell` into smaller contextual renderer components. Desktop data loading stays within existing desktop bridge/store boundaries; popups are local BrowserWindow views opened by IPC. Styling moves to semantic desktop tokens so light and dark modes share structure.

**Tech Stack:** Electron, electron-vite, React 19, TypeScript, Zustand, Vitest, Testing Library, CSS variables.

---

## File Map

- Modify: `apps/desktop/src/shared/ipc.ts`  
  Extend window mode types and desktop bridge methods for popups and internal call/directory/caller-id support.
- Modify: `apps/desktop/src/preload/index.ts`  
  Expose new IPC bridge calls.
- Modify: `apps/desktop/src/main/index.ts`  
  Add state window bounds, popup BrowserWindow creation, and IPC handlers.
- Modify: `apps/desktop/src/main/window-options.test.ts`  
  Verify window bounds and compatibility modes.
- Create: `apps/desktop/src/renderer/src/components/desktop-console-state.ts`  
  Pure state derivation and state-to-window-mode mapping.
- Create: `apps/desktop/src/renderer/src/components/desktop-console-state.test.ts`  
  Unit tests for state derivation and window mode mapping.
- Replace/Modify: `apps/desktop/src/renderer/src/components/SoftphoneShell.tsx`  
  Render contextual state screens, pass state mode changes to main, and remove always-visible feature lists.
- Modify: `apps/desktop/src/renderer/src/components/SoftphoneShell.test.tsx`  
  Add behavior tests for idle/ringing/talking/transferring/settings, caller IDs, and visibility rules.
- Modify: `apps/desktop/src/renderer/src/store/useDesktopStore.ts`  
  Load agent directory/caller IDs if desktop bridge exposes them, add internal originate and popup actions.
- Modify: `apps/desktop/src/renderer/src/store/useDesktopStore.test.ts`  
  Cover new store actions and bridge calls.
- Modify: `apps/desktop/src/renderer/src/styles.css`  
  Add light/dark semantic tokens and contextual console styles.
- Create: `apps/desktop/src/renderer/src/styles.theme.test.ts`  
  Verify required theme tokens exist.

---

### Task 1: Pure Console State And Window Mode

**Files:**
- Create: `apps/desktop/src/renderer/src/components/desktop-console-state.ts`
- Create: `apps/desktop/src/renderer/src/components/desktop-console-state.test.ts`

- [ ] **Step 1: Write the failing state tests**

Create `apps/desktop/src/renderer/src/components/desktop-console-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ActiveCall } from '../../../shared/cti';
import { deriveDesktopConsoleState, getWindowModeForConsoleState } from './desktop-console-state';

const baseCall: ActiveCall = {
  callId: 'call-1',
  linkedid: 'linked-1',
  ani: '01012345678',
  dnis: '15777893',
  queueName: 'main',
  sessionStatus: 'TALKING',
  startedAt: '2026-05-02T10:00:00.000Z',
  answeredAt: '2026-05-02T10:00:10.000Z',
};

describe('deriveDesktopConsoleState', () => {
  it('returns idle when there is no active call or softphone session', () => {
    expect(deriveDesktopConsoleState({ activeCall: null, softphone: null, settingsOpen: false })).toBe('idle');
  });

  it('returns ringing for queued or ringing CTI calls', () => {
    expect(deriveDesktopConsoleState({
      activeCall: { ...baseCall, sessionStatus: 'QUEUED', answeredAt: undefined },
      softphone: null,
      settingsOpen: false,
    })).toBe('ringing');
    expect(deriveDesktopConsoleState({
      activeCall: { ...baseCall, sessionStatus: 'RINGING_AGENT', answeredAt: undefined },
      softphone: null,
      settingsOpen: false,
    })).toBe('ringing');
  });

  it('returns talking for talking or hold calls', () => {
    expect(deriveDesktopConsoleState({ activeCall: baseCall, softphone: null, settingsOpen: false })).toBe('talking');
    expect(deriveDesktopConsoleState({
      activeCall: { ...baseCall, sessionStatus: 'HOLD' },
      softphone: null,
      settingsOpen: false,
    })).toBe('talking');
  });

  it('returns transferring before talking when a transfer is active', () => {
    expect(deriveDesktopConsoleState({
      activeCall: {
        ...baseCall,
        latestTransfer: { phase: 'REQUESTED', toExtension: '2001', requestedAt: '2026-05-02T10:01:00.000Z' },
      },
      softphone: null,
      settingsOpen: false,
    })).toBe('transferring');
  });

  it('returns afterCall for after call work', () => {
    expect(deriveDesktopConsoleState({
      activeCall: { ...baseCall, sessionStatus: 'AFTER_CALL_WORK' },
      softphone: null,
      settingsOpen: false,
    })).toBe('afterCall');
  });

  it('lets ringing override settings but settings override idle', () => {
    expect(deriveDesktopConsoleState({ activeCall: null, softphone: null, settingsOpen: true })).toBe('settings');
    expect(deriveDesktopConsoleState({
      activeCall: { ...baseCall, sessionStatus: 'RINGING_AGENT', answeredAt: undefined },
      softphone: null,
      settingsOpen: true,
    })).toBe('ringing');
  });
});

describe('getWindowModeForConsoleState', () => {
  it('maps each console state to a window mode', () => {
    expect(getWindowModeForConsoleState('idle')).toBe('idle');
    expect(getWindowModeForConsoleState('ringing')).toBe('ringing');
    expect(getWindowModeForConsoleState('talking')).toBe('talking');
    expect(getWindowModeForConsoleState('transferring')).toBe('transferring');
    expect(getWindowModeForConsoleState('afterCall')).toBe('afterCall');
    expect(getWindowModeForConsoleState('settings')).toBe('settings');
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\desktop
npm run test -- src/renderer/src/components/desktop-console-state.test.ts
```

Expected: FAIL because `desktop-console-state.ts` does not exist.

- [ ] **Step 3: Implement the pure helper**

Create `apps/desktop/src/renderer/src/components/desktop-console-state.ts`:

```ts
import type { ActiveCall } from '../../../shared/cti';
import type { DesktopWindowMode } from '../../../shared/ipc';
import type { SoftphoneState } from '../softphone/softphone-runtime';

export type DesktopConsoleState =
  | 'idle'
  | 'ringing'
  | 'talking'
  | 'transferring'
  | 'afterCall'
  | 'settings';

const ACTIVE_TRANSFER_PHASES = new Set(['REQUESTED', 'CONSULT_RINGING', 'CONSULT_TALKING', 'REBRIDGING']);

export function deriveDesktopConsoleState(input: {
  activeCall: ActiveCall | null;
  softphone: SoftphoneState | null;
  settingsOpen: boolean;
}): DesktopConsoleState {
  if (input.activeCall?.latestTransfer && ACTIVE_TRANSFER_PHASES.has(input.activeCall.latestTransfer.phase)) {
    return 'transferring';
  }

  if (input.activeCall?.sessionStatus === 'TRANSFERRING') {
    return 'transferring';
  }

  if (
    input.activeCall?.sessionStatus === 'QUEUED' ||
    input.activeCall?.sessionStatus === 'RINGING_AGENT' ||
    input.softphone?.session?.phase === 'ringing'
  ) {
    return 'ringing';
  }

  if (
    input.activeCall?.sessionStatus === 'TALKING' ||
    input.activeCall?.sessionStatus === 'HOLD' ||
    (input.softphone?.session && input.softphone.session.phase !== 'ringing')
  ) {
    return 'talking';
  }

  if (input.activeCall?.sessionStatus === 'AFTER_CALL_WORK') {
    return 'afterCall';
  }

  return input.settingsOpen ? 'settings' : 'idle';
}

export function getWindowModeForConsoleState(state: DesktopConsoleState): DesktopWindowMode {
  return state;
}
```

- [ ] **Step 4: Verify tests pass**

Run:

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\desktop
npm run test -- src/renderer/src/components/desktop-console-state.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
cd D:\Work\AI_Projects\KAster_CTI
git add apps/desktop/src/renderer/src/components/desktop-console-state.ts apps/desktop/src/renderer/src/components/desktop-console-state.test.ts
git commit -m "Add desktop console state helper"
```

---

### Task 2: Desktop IPC And Window Profiles

**Files:**
- Modify: `apps/desktop/src/shared/ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/window-options.test.ts`

- [ ] **Step 1: Write window mode tests**

Update `apps/desktop/src/main/window-options.test.ts` to include exported bounds tests. If the file currently only tests preload options, add these cases:

```ts
import { describe, expect, it } from 'vitest';
import { DESKTOP_WINDOW_BOUNDS, normalizeDesktopWindowMode } from './index';

describe('desktop window mode bounds', () => {
  it('keeps compact and full compatibility aliases', () => {
    expect(normalizeDesktopWindowMode('compact')).toBe('idle');
    expect(normalizeDesktopWindowMode('full')).toBe('settings');
  });

  it('defines bounds for every contextual console mode', () => {
    expect(DESKTOP_WINDOW_BOUNDS.idle).toMatchObject({ width: 420, height: 360, minWidth: 380, minHeight: 320 });
    expect(DESKTOP_WINDOW_BOUNDS.ringing).toMatchObject({ width: 440, height: 420, minWidth: 400, minHeight: 380 });
    expect(DESKTOP_WINDOW_BOUNDS.talking).toMatchObject({ width: 460, height: 620, minWidth: 420, minHeight: 540 });
    expect(DESKTOP_WINDOW_BOUNDS.transferring).toMatchObject({ width: 500, height: 640, minWidth: 440, minHeight: 560 });
    expect(DESKTOP_WINDOW_BOUNDS.afterCall).toMatchObject({ width: 460, height: 520, minWidth: 420, minHeight: 460 });
    expect(DESKTOP_WINDOW_BOUNDS.settings).toMatchObject({ width: 560, height: 720, minWidth: 500, minHeight: 640 });
  });
});
```

- [ ] **Step 2: Run the failing test**

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\desktop
npm run test -- src/main/window-options.test.ts
```

Expected: FAIL because `DESKTOP_WINDOW_BOUNDS` and `normalizeDesktopWindowMode` are not exported.

- [ ] **Step 3: Extend shared IPC types**

Update `apps/desktop/src/shared/ipc.ts`:

```ts
export type DesktopWindowMode =
  | 'compact'
  | 'full'
  | 'idle'
  | 'ringing'
  | 'talking'
  | 'transferring'
  | 'afterCall'
  | 'settings';
```

Change:

```ts
setWindowMode(mode: 'compact' | 'full'): Promise<void>;
```

to:

```ts
setWindowMode(mode: DesktopWindowMode): Promise<void>;
```

- [ ] **Step 4: Export and apply contextual bounds**

Update `apps/desktop/src/main/index.ts`:

```ts
import type { DesktopProtocolConnectPayload, DesktopWindowMode } from '../shared/ipc';
```

Replace the compact/full bounds constants with:

```ts
export const DESKTOP_WINDOW_BOUNDS = {
  idle: { width: 420, height: 360, minWidth: 380, minHeight: 320 },
  ringing: { width: 440, height: 420, minWidth: 400, minHeight: 380 },
  talking: { width: 460, height: 620, minWidth: 420, minHeight: 540 },
  transferring: { width: 500, height: 640, minWidth: 440, minHeight: 560 },
  afterCall: { width: 460, height: 520, minWidth: 420, minHeight: 460 },
  settings: { width: 560, height: 720, minWidth: 500, minHeight: 640 },
} as const;

export function normalizeDesktopWindowMode(mode: DesktopWindowMode): keyof typeof DESKTOP_WINDOW_BOUNDS {
  if (mode === 'compact') {
    return 'idle';
  }
  if (mode === 'full') {
    return 'settings';
  }
  return mode;
}
```

In `createWindow`, use `DESKTOP_WINDOW_BOUNDS.idle`.

Change `applyWindowMode` to:

```ts
function applyWindowMode(mode: DesktopWindowMode) {
  const win = getPrimaryWindow();
  if (!win) {
    return;
  }

  const bounds = DESKTOP_WINDOW_BOUNDS[normalizeDesktopWindowMode(mode)];
  win.setMinimumSize(bounds.minWidth, bounds.minHeight);
  win.setSize(bounds.width, bounds.height);
  win.center();
}
```

Change the IPC handler type to `DesktopWindowMode`.

- [ ] **Step 5: Verify test passes**

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\desktop
npm run test -- src/main/window-options.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
cd D:\Work\AI_Projects\KAster_CTI
git add apps/desktop/src/shared/ipc.ts apps/desktop/src/preload/index.ts apps/desktop/src/main/index.ts apps/desktop/src/main/window-options.test.ts
git commit -m "Add contextual desktop window modes"
```

---

### Task 3: Bridge Data For Caller IDs And Agent Directory

**Files:**
- Modify: `apps/desktop/src/shared/ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/renderer/src/store/useDesktopStore.ts`
- Modify: `apps/desktop/src/renderer/src/store/useDesktopStore.test.ts`

- [ ] **Step 1: Add store tests for caller IDs and internal originate**

Add tests to `apps/desktop/src/renderer/src/store/useDesktopStore.test.ts`:

```ts
it('loads registered caller IDs and agent directory during authenticated initialization', async () => {
  desktopApi.getConfig.mockResolvedValueOnce({ serverUrl: 'https://cti.example.com', channel: 'stable', deviceId: 'device-1' });
  desktopApi.getSession.mockResolvedValueOnce({
    agent: { agentId: 'agent-1', agentName: 'Agent One', extension: '1001', role: 'agent' },
    softphoneConfig: { enabled: false, sipUri: null, wsServer: null, authorizationUsername: null, authorizationPassword: null, displayName: 'Agent One', iceServers: [] },
  });
  desktopApi.refreshSession.mockResolvedValueOnce(null);
  desktopApi.getCallerIds.mockResolvedValueOnce({ callerIds: ['15777893'], defaultCallerId: '15777893' });
  desktopApi.getAgentDirectory.mockResolvedValueOnce([
    { agentId: 'agent-2', agentName: 'Agent Two', extension: '1002', role: 'agent', isActive: true, currentStatus: { statusCode: 'AVAILABLE' } },
  ]);

  await useDesktopStore.getState().initialize();

  expect(useDesktopStore.getState().callerIds).toEqual(['15777893']);
  expect(useDesktopStore.getState().defaultCallerId).toBe('15777893');
  expect(useDesktopStore.getState().agentDirectory).toHaveLength(1);
});

it('originates internal calls through desktop bridge', async () => {
  useDesktopStore.setState({
    agent: { agentId: 'agent-1', agentName: 'Agent One', extension: '1001', role: 'agent' },
    agentDirectory: [{ agentId: 'agent-2', agentName: 'Agent Two', extension: '1002', role: 'agent', isActive: true, currentStatus: { statusCode: 'AVAILABLE' } }],
  });

  await useDesktopStore.getState().originateInternal({ agentId: 'agent-2', agentName: 'Agent Two', extension: '1002', role: 'agent', isActive: true, currentStatus: { statusCode: 'AVAILABLE' } });

  expect(desktopApi.originateInternal).toHaveBeenCalledWith({ targetAgentId: 'agent-2', targetExtension: '1002' });
});
```

- [ ] **Step 2: Run failing store tests**

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\desktop
npm run test -- src/renderer/src/store/useDesktopStore.test.ts
```

Expected: FAIL because bridge/store fields do not exist.

- [ ] **Step 3: Add shared types and bridge methods**

In `apps/desktop/src/shared/ipc.ts`, add:

```ts
export interface DesktopAgentDirectoryItem {
  agentId: string;
  agentName: string;
  extension: string;
  role: string;
  isActive: boolean;
  currentStatus?: {
    statusCode: import('./cti').AgentStatusCode;
  } | null;
}

export interface DesktopCallerIdConfig {
  callerIds: string[];
  defaultCallerId: string | null;
}
```

Add to `DesktopApi`:

```ts
getCallerIds(): Promise<DesktopCallerIdConfig>;
getAgentDirectory(): Promise<DesktopAgentDirectoryItem[]>;
originateInternal(input: { targetAgentId: string; targetExtension: string }): Promise<import('./cti').CommandAck>;
openCallHistoryPopup(): Promise<void>;
openAgentListPopup(): Promise<void>;
```

- [ ] **Step 4: Wire preload methods**

In `apps/desktop/src/preload/index.ts`, add:

```ts
getCallerIds: () => ipcRenderer.invoke('desktop:get-caller-ids'),
getAgentDirectory: () => ipcRenderer.invoke('desktop:get-agent-directory'),
originateInternal: (input) => ipcRenderer.invoke('desktop:originate-internal', input),
openCallHistoryPopup: () => ipcRenderer.invoke('desktop:open-call-history-popup'),
openAgentListPopup: () => ipcRenderer.invoke('desktop:open-agent-list-popup'),
```

- [ ] **Step 5: Implement main IPC through existing runtime API**

In `apps/desktop/src/main/index.ts`, add handlers using existing runtime/auth clients. If runtime does not yet expose exact calls, call the server API through the authenticated desktop client in the same style as existing `desktop:originate`.

The behavior must be:

```ts
ipcMain.handle('desktop:get-caller-ids', async () => {
  return runtime?.getCallerIds?.() ?? { callerIds: [], defaultCallerId: null };
});

ipcMain.handle('desktop:get-agent-directory', async () => {
  return runtime?.getAgentDirectory?.() ?? [];
});

ipcMain.handle('desktop:originate-internal', async (_event, input: { targetAgentId: string; targetExtension: string }) => {
  if (!runtime) {
    throw new Error('CTI runtime is not connected.');
  }
  return runtime.originateInternal(input);
});
```

If `CtiRuntime` lacks these methods, add focused methods in `apps/desktop/src/main/cti-runtime.ts`:

```ts
async getAgentDirectory() {
  return this.request('/agents');
}

async getCallerIds() {
  const dashboard = await this.request('/admin/dashboard');
  return dashboard?.dialing ?? { callerIds: [], defaultCallerId: null };
}

async originateInternal(input: { targetAgentId: string; targetExtension: string }) {
  return this.request('/calls/originate/internal', {
    method: 'POST',
    body: input,
  });
}
```

Use the actual private request helper names already present in `cti-runtime.ts`.

- [ ] **Step 6: Extend store state**

In `useDesktopStore.ts`, add state:

```ts
callerIds: string[];
defaultCallerId: string | null;
agentDirectory: DesktopAgentDirectoryItem[];
originateInternal(target: DesktopAgentDirectoryItem): Promise<void>;
openCallHistoryPopup(): Promise<void>;
openAgentListPopup(): Promise<void>;
```

During authenticated hydration, load:

```ts
const [audioPreferences, update, callerIdConfig, agentDirectory] = await Promise.all([
  desktopApi.getAudioPreferences(),
  desktopApi.checkForUpdates(),
  desktopApi.getCallerIds(),
  desktopApi.getAgentDirectory(),
]);
```

Set:

```ts
callerIds: callerIdConfig.callerIds,
defaultCallerId: callerIdConfig.defaultCallerId,
agentDirectory,
```

Implement:

```ts
async originateInternal(target) {
  await getDesktopApi().originateInternal({
    targetAgentId: target.agentId,
    targetExtension: target.extension,
  });
  set((current) => ({
    events: pushEvent(current.events, `내선 통화 요청 ${target.agentName} / ${target.extension}`),
  }));
}
```

- [ ] **Step 7: Verify tests pass**

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\desktop
npm run test -- src/renderer/src/store/useDesktopStore.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
cd D:\Work\AI_Projects\KAster_CTI
git add apps/desktop/src/shared/ipc.ts apps/desktop/src/preload/index.ts apps/desktop/src/main/index.ts apps/desktop/src/main/cti-runtime.ts apps/desktop/src/renderer/src/store/useDesktopStore.ts apps/desktop/src/renderer/src/store/useDesktopStore.test.ts
git commit -m "Load desktop dialer data"
```

---

### Task 4: Contextual SoftphoneShell Rendering

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/SoftphoneShell.tsx`
- Modify: `apps/desktop/src/renderer/src/components/SoftphoneShell.test.tsx`

- [ ] **Step 1: Replace legacy expectations with contextual UI tests**

Update `SoftphoneShell.test.tsx` to assert:

```ts
it('shows idle dialer controls without call controls', () => {
  render(<SoftphoneShell {...baseProps} callerIds={['15777893']} defaultCallerId="15777893" agentDirectory={[]} />);

  expect(screen.getByText('KAster CTI')).toBeTruthy();
  expect(screen.getByText('대기 중')).toBeTruthy();
  expect(screen.getByLabelText('발신번호')).toBeTruthy();
  expect(screen.getByPlaceholderText('전화번호 입력')).toBeTruthy();
  expect(screen.getByRole('button', { name: '발신 요청' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '전환' })).toBeNull();
  expect(screen.queryByRole('button', { name: '종료' })).toBeNull();
});

it('disables external dialing when no caller ID is registered', () => {
  render(<SoftphoneShell {...baseProps} callerIds={[]} defaultCallerId={null} agentDirectory={[]} />);

  expect(screen.getByText('등록된 발신번호 없음')).toBeTruthy();
  expect(screen.getByRole('button', { name: '발신 요청' })).toBeDisabled();
});

it('shows ringing actions without transfer or external dialer', () => {
  render(<SoftphoneShell {...baseProps} activeCall={{ ...activeCall, sessionStatus: 'RINGING_AGENT', answeredAt: undefined }} callerIds={['15777893']} defaultCallerId="15777893" agentDirectory={[]} />);

  expect(screen.getByText('수신 대기')).toBeTruthy();
  expect(screen.getByRole('button', { name: '수신' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '전환' })).toBeNull();
  expect(screen.queryByPlaceholderText('전화번호 입력')).toBeNull();
});

it('shows transfer only during talking calls', () => {
  render(<SoftphoneShell {...baseProps} activeCall={activeCall} callerIds={['15777893']} defaultCallerId="15777893" agentDirectory={[]} />);

  expect(screen.getByText('통화 중')).toBeTruthy();
  expect(screen.getByRole('button', { name: '전환 열기' })).toBeTruthy();
});
```

Keep existing settings/audio assertions, but update labels to the new layout.

- [ ] **Step 2: Run failing component tests**

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\desktop
npm run test -- src/renderer/src/components/SoftphoneShell.test.tsx
```

Expected: FAIL because props/UI are not implemented.

- [ ] **Step 3: Refactor SoftphoneShell**

Modify `SoftphoneShell.tsx`:

- Add props:

```ts
callerIds: string[];
defaultCallerId: string | null;
agentDirectory: DesktopAgentDirectoryItem[];
onOriginateInternal: (target: DesktopAgentDirectoryItem) => void;
onOpenCallHistory: () => void;
onOpenAgentList: () => void;
```

- Use `deriveDesktopConsoleState`.
- Use `useEffect` to call `window.desktopApi.setWindowMode(getWindowModeForConsoleState(consoleState))`.
- Render sections:
  - header
  - `IdleConsole`
  - `RingingConsole`
  - `TalkingConsole`
  - `TransferConsole`
  - `AfterCallConsole`
  - `SettingsConsole`

Minimum implementation rules:

```ts
const canTransfer = consoleState === 'talking' || consoleState === 'transferring';
```

Only render transfer controls when `canTransfer` is true.

In idle external dialer:

```tsx
<select aria-label="발신번호" value={selectedCallerId} onChange={(event) => setSelectedCallerId(event.target.value)}>
  {callerIds.length === 0 ? <option value="">등록된 발신번호 없음</option> : callerIds.map((callerId) => <option key={callerId} value={callerId}>{callerId}</option>)}
</select>
```

On external originate:

```ts
if (!callerIds.includes(selectedCallerId)) {
  return;
}
onOriginate(dialNumber, selectedCallerId);
```

Adjust `onOriginate` type if needed to accept `callerId`.

- [ ] **Step 4: Verify component tests pass**

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\desktop
npm run test -- src/renderer/src/components/SoftphoneShell.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
cd D:\Work\AI_Projects\KAster_CTI
git add apps/desktop/src/renderer/src/components/SoftphoneShell.tsx apps/desktop/src/renderer/src/components/SoftphoneShell.test.tsx
git commit -m "Render desktop contextual console"
```

---

### Task 5: Theme Tokens And Responsive Desktop Styling

**Files:**
- Modify: `apps/desktop/src/renderer/src/styles.css`
- Create: `apps/desktop/src/renderer/src/styles.theme.test.ts`

- [ ] **Step 1: Add theme token test**

Create `styles.theme.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');

describe('desktop theme tokens', () => {
  it('defines semantic light and dark desktop tokens', () => {
    for (const token of [
      '--desktop-bg',
      '--desktop-surface',
      '--desktop-surface-raised',
      '--desktop-fg',
      '--desktop-muted',
      '--desktop-border',
      '--status-available',
      '--status-ringing',
      '--status-talking',
      '--status-acw',
      '--status-offline',
      '--action-primary',
      '--action-danger',
      '--action-neutral',
    ]) {
      expect(css).toContain(token);
    }
    expect(css).toContain('@media (prefers-color-scheme: light)');
  });
});
```

- [ ] **Step 2: Run failing theme test**

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\desktop
npm run test -- src/renderer/src/styles.theme.test.ts
```

Expected: FAIL until tokens are added.

- [ ] **Step 3: Add semantic CSS**

In `styles.css`, add:

```css
:root {
  --desktop-bg: #0f1418;
  --desktop-surface: #161d23;
  --desktop-surface-raised: #1e2730;
  --desktop-fg: #eef3f1;
  --desktop-muted: #9ba9a5;
  --desktop-border: #2c3942;
  --status-available: #39c978;
  --status-ringing: #f7c948;
  --status-talking: #54a3ff;
  --status-acw: #b68cff;
  --status-offline: #7b8790;
  --action-primary: #39c978;
  --action-danger: #ff746b;
  --action-neutral: #2a3540;
}

@media (prefers-color-scheme: light) {
  :root {
    --desktop-bg: #edf2f4;
    --desktop-surface: #ffffff;
    --desktop-surface-raised: #f7fafb;
    --desktop-fg: #172026;
    --desktop-muted: #68767d;
    --desktop-border: #cfdae0;
    --status-available: #167a45;
    --status-ringing: #a66b00;
    --status-talking: #1769aa;
    --status-acw: #6f42c1;
    --status-offline: #69767f;
    --action-primary: #167a45;
    --action-danger: #c92f2f;
    --action-neutral: #eef3f5;
  }
}
```

Then add `.desktop-console-*` classes used by `SoftphoneShell` with:
- card radius at 8px or less,
- no copied legacy brand/image,
- no nested decorative cards,
- fixed button heights,
- readable text in both themes.

- [ ] **Step 4: Verify theme test passes**

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\desktop
npm run test -- src/renderer/src/styles.theme.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
cd D:\Work\AI_Projects\KAster_CTI
git add apps/desktop/src/renderer/src/styles.css apps/desktop/src/renderer/src/styles.theme.test.ts
git commit -m "Add desktop console theme tokens"
```

---

### Task 6: Popup Windows For History And Agent List

**Files:**
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/shared/ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/src/components/SoftphoneShell.tsx`
- Modify: `apps/desktop/src/renderer/src/components/SoftphoneShell.test.tsx`

- [ ] **Step 1: Add popup action tests**

In `SoftphoneShell.test.tsx`, add:

```ts
it('opens call history and agent list through header actions', () => {
  const onOpenCallHistory = vi.fn();
  const onOpenAgentList = vi.fn();

  render(
    <SoftphoneShell
      {...baseProps}
      callerIds={['15777893']}
      defaultCallerId="15777893"
      agentDirectory={[]}
      onOpenCallHistory={onOpenCallHistory}
      onOpenAgentList={onOpenAgentList}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: '통화내역' }));
  fireEvent.click(screen.getByRole('button', { name: '상담원 리스트' }));

  expect(onOpenCallHistory).toHaveBeenCalled();
  expect(onOpenAgentList).toHaveBeenCalled();
});
```

- [ ] **Step 2: Add main popup helpers**

In `main/index.ts`, add:

```ts
function openUtilityWindow(kind: 'history' | 'agents') {
  const existing = BrowserWindow.getAllWindows().find((win) => win.getTitle() === (kind === 'history' ? 'KAster 통화내역' : 'KAster 상담원 리스트'));
  if (existing) {
    existing.show();
    existing.focus();
    return;
  }

  const bounds = kind === 'history'
    ? { width: 920, height: 640, minWidth: 760, minHeight: 520 }
    : { width: 440, height: 560, minWidth: 380, minHeight: 460 };

  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: bounds.minWidth,
    minHeight: bounds.minHeight,
    parent: getPrimaryWindow() ?? undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.setTitle(kind === 'history' ? 'KAster 통화내역' : 'KAster 상담원 리스트');
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  const route = kind === 'history' ? '#/history-popup' : '#/agent-list-popup';
  if (rendererUrl) {
    void win.loadURL(`${rendererUrl}${route}`);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: route.slice(1) });
  }
}
```

Add IPC handlers:

```ts
ipcMain.handle('desktop:open-call-history-popup', () => openUtilityWindow('history'));
ipcMain.handle('desktop:open-agent-list-popup', () => openUtilityWindow('agents'));
```

- [ ] **Step 3: Render minimal popup routes**

In renderer app routing, detect `window.location.hash`:

```tsx
if (window.location.hash === '#/history-popup') {
  return <CallHistoryPopup />;
}
if (window.location.hash === '#/agent-list-popup') {
  return <AgentListPopup />;
}
```

Initial popup components can be simple, functional shells using loaded store data:
- `CallHistoryPopup`: filters row and an empty state until API wiring is expanded.
- `AgentListPopup`: search input, agent list, click calls `originateInternal`.

- [ ] **Step 4: Verify tests pass**

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\desktop
npm run test -- src/renderer/src/components/SoftphoneShell.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
cd D:\Work\AI_Projects\KAster_CTI
git add apps/desktop/src/main/index.ts apps/desktop/src/shared/ipc.ts apps/desktop/src/preload/index.ts apps/desktop/src/renderer/src/App.tsx apps/desktop/src/renderer/src/components/SoftphoneShell.tsx apps/desktop/src/renderer/src/components/SoftphoneShell.test.tsx
git commit -m "Add desktop utility popups"
```

---

### Task 7: Full Verification And Build Artifacts

**Files:**
- Modify: `apps/desktop/out/**` by running build.

- [ ] **Step 1: Run full desktop tests**

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\desktop
npm run test
```

Expected: all desktop tests pass.

- [ ] **Step 2: Run desktop build**

```powershell
cd D:\Work\AI_Projects\KAster_CTI\apps\desktop
npm run build
```

Expected: electron-vite build succeeds and `apps/desktop/out` hash assets are updated.

- [ ] **Step 3: Launch desktop app**

```powershell
Start-Process -FilePath "npm.cmd" -ArgumentList @("run","dev") -WorkingDirectory "D:\Work\AI_Projects\KAster_CTI\apps\desktop"
```

Expected: `KAster Agent Desktop` Electron window opens.

- [ ] **Step 4: Visual verification**

Use a mock desktopApi preview or in-app browser preview to verify:
- idle screen dark mode,
- idle screen light mode,
- ringing screen,
- talking screen,
- transferring screen,
- settings screen,
- no transfer controls outside talking/transferring,
- no copied legacy brand/left image,
- window resizing calls use the expected state mode.

- [ ] **Step 5: Commit final build**

```powershell
cd D:\Work\AI_Projects\KAster_CTI
git add apps/desktop/out apps/desktop/src
git commit -m "Build desktop contextual console"
```

---

## Self-Review

Spec coverage:
- State-driven console: Tasks 1 and 4.
- State-based window sizing: Task 2.
- Registered caller IDs: Tasks 3 and 4.
- Internal calls via agent list: Tasks 3 and 6.
- Call history popup: Task 6.
- Light/dark theme: Task 5.
- Settings/diagnostics hidden from normal flow: Task 4.
- Verification and build: Task 7.

Placeholder scan:
- Every task includes concrete paths, commands, and expected results.

Type consistency:
- `DesktopWindowMode`, `DesktopConsoleState`, `DesktopAgentDirectoryItem`, and `DesktopCallerIdConfig` are introduced before use.
- `originateInternal`, `openCallHistoryPopup`, and `openAgentListPopup` are added to shared IPC before renderer/store calls depend on them.
