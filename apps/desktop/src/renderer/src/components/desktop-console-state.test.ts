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
