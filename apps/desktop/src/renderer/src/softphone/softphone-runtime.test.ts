import { describe, expect, it } from 'vitest';
import { createSoftphoneState } from './softphone-runtime';

describe('createSoftphoneState', () => {
  it('softphone 설정이 활성화되면 idle 등록 상태로 시작한다', () => {
    expect(
      createSoftphoneState({
        enabled: true,
        sipUri: 'sip:1001@pbx.example.com',
        wsServer: 'wss://pbx.example.com:8089/ws',
        authorizationUsername: '1001',
        displayName: '상담원1',
        iceServers: [],
      }),
    ).toEqual({
      registration: 'idle',
      transport: 'not-connected',
      config: {
        enabled: true,
        sipUri: 'sip:1001@pbx.example.com',
        wsServer: 'wss://pbx.example.com:8089/ws',
        authorizationUsername: '1001',
        displayName: '상담원1',
        iceServers: [],
      },
      lastError: null,
      diagnostics: [],
      session: null,
      remoteAudioActive: false,
      localMuted: false,
      localHold: false,
    });
  });

  it('softphone 이 비활성화되면 disabled 상태를 유지한다', () => {
    expect(
      createSoftphoneState({
        enabled: false,
        sipUri: null,
        wsServer: null,
        authorizationUsername: null,
        displayName: '상담원1',
        iceServers: [],
      }),
    ).toEqual({
      registration: 'disabled',
      transport: 'not-configured',
      config: {
        enabled: false,
        sipUri: null,
        wsServer: null,
        authorizationUsername: null,
        displayName: '상담원1',
        iceServers: [],
      },
      lastError: null,
      diagnostics: [],
      session: null,
      remoteAudioActive: false,
      localMuted: false,
      localHold: false,
    });
  });
});
