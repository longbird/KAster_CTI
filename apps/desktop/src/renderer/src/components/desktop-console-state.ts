import type { ActiveCall } from '../../../shared/cti';
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
    (
      input.softphone?.session?.direction === 'incoming' &&
      input.softphone.session.phase === 'ringing'
    )
  ) {
    return 'ringing';
  }

  if (
    input.activeCall?.sessionStatus === 'TALKING' ||
    input.activeCall?.sessionStatus === 'HOLD' ||
    (
      input.softphone?.session &&
      (
        input.softphone.session.direction === 'outgoing' ||
        input.softphone.session.phase !== 'ringing'
      )
    )
  ) {
    return 'talking';
  }

  if (input.activeCall?.sessionStatus === 'AFTER_CALL_WORK') {
    return 'afterCall';
  }

  return input.settingsOpen ? 'settings' : 'idle';
}

export function getWindowModeForConsoleState(state: DesktopConsoleState): DesktopConsoleState {
  return state;
}
