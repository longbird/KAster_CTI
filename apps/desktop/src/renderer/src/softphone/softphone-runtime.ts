import type { DesktopSoftphoneConfig } from '../../../shared/ipc';

export interface SoftphoneDiagnostic {
  code: string;
  message: string;
  hint: string | null;
  source: 'config' | 'transport' | 'registration';
  severity: 'warning' | 'error';
  occurredAt: string;
}

export interface SoftphoneCallState {
  id: string;
  direction: 'incoming' | 'outgoing';
  phase: 'ringing' | 'establishing' | 'active' | 'terminating';
  remoteDisplayName: string;
  remoteUri: string | null;
}

export interface SoftphoneState {
  registration: 'disabled' | 'idle' | 'registering' | 'registered' | 'error';
  transport: 'not-configured' | 'not-connected' | 'connecting' | 'connected' | 'error';
  config: DesktopSoftphoneConfig;
  lastError: string | null;
  diagnostics: SoftphoneDiagnostic[];
  session: SoftphoneCallState | null;
  remoteAudioActive: boolean;
}

export function createSoftphoneState(config: DesktopSoftphoneConfig): SoftphoneState {
  if (!config.enabled || !config.wsServer || !config.sipUri || !config.authorizationUsername) {
    return {
      registration: 'disabled',
      transport: 'not-configured',
      config,
      lastError: null,
      diagnostics: [],
      session: null,
      remoteAudioActive: false,
    };
  }

  return {
    registration: 'idle',
    transport: 'not-connected',
    config,
    lastError: null,
    diagnostics: [],
    session: null,
    remoteAudioActive: false,
  };
}
