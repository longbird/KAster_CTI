import { beforeEach, describe, expect, it, vi } from 'vitest';

const sipMocks = vi.hoisted(() => {
  const start = vi.fn(async () => undefined);
  const stop = vi.fn(async () => undefined);
  const register = vi.fn(async () => undefined);
  const unregister = vi.fn(async () => undefined);
  const invitationAccept = vi.fn(async () => undefined);
  const invitationReject = vi.fn(async () => undefined);
  const sessionBye = vi.fn(async () => undefined);
  const sessionStateListener = vi.fn();
  const userAgentDelegate: { onConnect?: () => void; onDisconnect?: () => void } = {};
  const registererStateChangeAddListener = vi.fn();
  const MockUserAgent = vi.fn().mockImplementation((options: unknown) => ({
    options,
    delegate: userAgentDelegate,
    start,
    stop,
  }));

  (MockUserAgent as unknown as { makeURI: (value: string) => { raw: string } }).makeURI = (
    value: string,
  ) => ({ raw: value });

  return {
    start,
    stop,
    register,
    unregister,
    invitationAccept,
    invitationReject,
    sessionBye,
    sessionStateListener,
    userAgentDelegate,
    registererStateChangeAddListener,
    MockUserAgent,
  };
});

vi.mock('sip.js', () => ({
  UserAgent: sipMocks.MockUserAgent,
  Registerer: vi.fn().mockImplementation(() => ({
    stateChange: {
      addListener: sipMocks.registererStateChangeAddListener,
    },
    register: sipMocks.register,
    unregister: sipMocks.unregister,
  })),
  RegistererState: {
    Initial: 'Initial',
    Registered: 'Registered',
    Unregistered: 'Unregistered',
    Terminated: 'Terminated',
  },
  SessionState: {
    Initial: 'Initial',
    Establishing: 'Establishing',
    Established: 'Established',
    Terminating: 'Terminating',
    Terminated: 'Terminated',
  },
}));

import { SipSoftphoneClient } from './sip-softphone-client';

describe('SipSoftphoneClient', () => {
  beforeEach(() => {
    sipMocks.start.mockClear();
    sipMocks.stop.mockClear();
    sipMocks.register.mockClear();
    sipMocks.unregister.mockClear();
    sipMocks.invitationAccept.mockClear();
    sipMocks.invitationReject.mockClear();
    sipMocks.sessionBye.mockClear();
    sipMocks.sessionStateListener.mockClear();
    sipMocks.registererStateChangeAddListener.mockClear();
  });

  it('start 는 sip.js user agent 와 registerer 를 만들고 등록을 시작한다', async () => {
    const events: string[] = [];
    const client = new SipSoftphoneClient({
      onTransportState: (state) => events.push(`transport:${state}`),
      onRegistrationState: (state) => events.push(`registration:${state}`),
      onCallState: () => undefined,
      onRemoteStream: () => undefined,
      onError: (message) => events.push(`error:${message}`),
      onDiagnostic: (diagnostic) => events.push(`diagnostic:${diagnostic.code}`),
    });

    await client.start({
      enabled: true,
      sipUri: 'sip:1001@pbx.example.com',
      wsServer: 'wss://pbx.example.com:8089/ws',
      authorizationUsername: '1001',
      authorizationPassword: 'sip-secret-1001',
      displayName: '상담원1',
      iceServers: [],
    });

    expect(sipMocks.start).toHaveBeenCalled();
    expect(sipMocks.register).toHaveBeenCalled();
    expect(sipMocks.registererStateChangeAddListener).toHaveBeenCalled();
  });

  it('incoming invite 를 수신하면 ringing 상태를 올리고 answer 로 accept 를 호출한다', async () => {
    const events: string[] = [];
    const client = new SipSoftphoneClient({
      onTransportState: (state) => events.push(`transport:${state}`),
      onRegistrationState: (state) => events.push(`registration:${state}`),
      onCallState: (call) => events.push(call ? `call:${call.phase}:${call.remoteDisplayName}` : 'call:none'),
      onRemoteStream: (stream) => events.push(stream ? 'stream:attached' : 'stream:detached'),
      onError: (message) => events.push(`error:${message}`),
      onDiagnostic: (diagnostic) => events.push(`diagnostic:${diagnostic.code}`),
    });

    await client.start({
      enabled: true,
      sipUri: 'sip:1001@pbx.example.com',
      wsServer: 'wss://pbx.example.com:8089/ws',
      authorizationUsername: '1001',
      authorizationPassword: 'sip-secret-1001',
      displayName: '상담원1',
      iceServers: [],
    });

    const peerConnection = {
      getReceivers: () => [{ track: { kind: 'audio', id: 'track-1' } }],
    };
    const invitation = {
      id: 'invite-1',
      state: 'Initial',
      remoteIdentity: {
        displayName: '고객A',
        uri: { toString: () => 'sip:customer-a@pbx.example.com' },
      },
      stateChange: {
        addListener: sipMocks.sessionStateListener,
      },
      accept: sipMocks.invitationAccept,
      reject: sipMocks.invitationReject,
      bye: sipMocks.sessionBye,
      sessionDescriptionHandler: {
        peerConnection,
      },
    };

    await (client as unknown as { handleIncomingInvitation: (session: unknown) => Promise<void> })
      .handleIncomingInvitation(invitation);

    expect(events).toContain('call:ringing:고객A');

    await client.answer({
      inputDeviceId: 'microphone-1',
      outputDeviceId: 'speaker-1',
      ringDeviceId: null,
      echoCancellation: true,
      noiseSuppression: false,
    });

    expect(sipMocks.invitationAccept).toHaveBeenCalledWith({
      sessionDescriptionHandlerOptions: {
        constraints: {
          audio: {
            deviceId: { exact: 'microphone-1' },
            echoCancellation: true,
            noiseSuppression: false,
          },
          video: false,
        },
      },
    });

    const listener = sipMocks.sessionStateListener.mock.calls[0]?.[0] as ((state: string) => void) | undefined;
    invitation.state = 'Established';
    listener?.('Established');

    expect(events).toContain('call:active:고객A');
    expect(events).toContain('stream:attached');
  });

  it('reject 와 hangup 은 현재 세션 상태에 맞는 SIP 메서드를 호출한다', async () => {
    const client = new SipSoftphoneClient({
      onTransportState: () => undefined,
      onRegistrationState: () => undefined,
      onCallState: () => undefined,
      onRemoteStream: () => undefined,
      onError: () => undefined,
      onDiagnostic: () => undefined,
    });

    await client.start({
      enabled: true,
      sipUri: 'sip:1001@pbx.example.com',
      wsServer: 'wss://pbx.example.com:8089/ws',
      authorizationUsername: '1001',
      authorizationPassword: 'sip-secret-1001',
      displayName: '상담원1',
      iceServers: [],
    });

    const invitation = {
      id: 'invite-2',
      state: 'Initial',
      remoteIdentity: {
        displayName: '고객B',
        uri: { toString: () => 'sip:customer-b@pbx.example.com' },
      },
      stateChange: {
        addListener: sipMocks.sessionStateListener,
      },
      accept: sipMocks.invitationAccept,
      reject: sipMocks.invitationReject,
      bye: sipMocks.sessionBye,
      sessionDescriptionHandler: undefined,
    };

    await (client as unknown as { handleIncomingInvitation: (session: unknown) => Promise<void> })
      .handleIncomingInvitation(invitation);

    await client.reject();
    expect(sipMocks.invitationReject).toHaveBeenCalled();

    await (client as unknown as { handleIncomingInvitation: (session: unknown) => Promise<void> })
      .handleIncomingInvitation(invitation);
    const listener = sipMocks.sessionStateListener.mock.calls.at(-1)?.[0] as ((state: string) => void) | undefined;
    invitation.state = 'Established';
    listener?.('Established');

    await client.hangup();
    expect(sipMocks.sessionBye).toHaveBeenCalled();
  });

  it('stop 은 등록 해제 후 user agent 종료를 호출한다', async () => {
    const client = new SipSoftphoneClient({
      onTransportState: () => undefined,
      onRegistrationState: () => undefined,
      onCallState: () => undefined,
      onRemoteStream: () => undefined,
      onError: () => undefined,
      onDiagnostic: () => undefined,
    });

    await client.start({
      enabled: true,
      sipUri: 'sip:1001@pbx.example.com',
      wsServer: 'wss://pbx.example.com:8089/ws',
      authorizationUsername: '1001',
      authorizationPassword: 'sip-secret-1001',
      displayName: '상담원1',
      iceServers: [],
    });
    await client.stop();

    expect(sipMocks.unregister).toHaveBeenCalled();
    expect(sipMocks.stop).toHaveBeenCalled();
  });

  it('invalid sip uri 일 때 diagnostic 을 올리고 등록 상태를 error 로 둔다', async () => {
    const diagnostics: string[] = [];
    (sipMocks.MockUserAgent as unknown as { makeURI: (value: string) => unknown }).makeURI = () => null;
    const client = new SipSoftphoneClient({
      onTransportState: () => undefined,
      onRegistrationState: () => undefined,
      onCallState: () => undefined,
      onRemoteStream: () => undefined,
      onError: () => undefined,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
    });

    await client.start({
      enabled: true,
      sipUri: 'not-a-valid-uri',
      wsServer: 'wss://pbx.example.com:8089/ws',
      authorizationUsername: '1001',
      authorizationPassword: 'sip-secret-1001',
      displayName: '상담원1',
      iceServers: [],
    });

    expect(diagnostics).toContain('INVALID_SIP_URI');
    expect(sipMocks.start).not.toHaveBeenCalled();
  });
});
