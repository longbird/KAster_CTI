import {
  SessionState,
  type Invitation,
  Registerer,
  RegistererState,
  UserAgent,
  type RegistererOptions,
  type Session,
  type SessionDelegate,
  type UserAgentDelegate,
  type UserAgentOptions,
} from 'sip.js';
import type { DesktopAudioPreferences, DesktopSoftphoneConfig } from '../../../shared/ipc';
import type { SoftphoneCallState } from './softphone-runtime';

type RegistrationState = 'disabled' | 'idle' | 'registering' | 'registered' | 'error';
type TransportState = 'not-configured' | 'not-connected' | 'connecting' | 'connected' | 'error';

interface WebSessionDescriptionHandlerLike {
  remoteMediaStream?: MediaStream;
  peerConnection?: {
    getReceivers(): Array<{
      track?: MediaStreamTrack | null;
    }>;
  };
}

export class SipSoftphoneClient {
  private userAgent: UserAgent | null = null;
  private registerer: Registerer | null = null;
  private currentSession: Session | Invitation | null = null;
  private currentDirection: 'incoming' | 'outgoing' = 'incoming';

  constructor(
    private readonly callbacks: {
      onTransportState: (state: TransportState) => void;
      onRegistrationState: (state: RegistrationState) => void;
      onCallState: (call: SoftphoneCallState | null) => void;
      onRemoteStream: (stream: MediaStream | null) => void;
      onError: (message: string) => void;
      onDiagnostic: (diagnostic: {
        code: string;
        message: string;
        hint: string | null;
        source: 'config' | 'transport' | 'registration';
        severity: 'warning' | 'error';
      }) => void;
    },
  ) {}

  async start(config: DesktopSoftphoneConfig & { authorizationPassword: string | null }) {
    if (
      !config.enabled
      || !config.sipUri
      || !config.wsServer
      || !config.authorizationUsername
      || !config.authorizationPassword
    ) {
      this.callbacks.onRegistrationState('disabled');
      this.callbacks.onTransportState('not-configured');
      return;
    }

    const uri = UserAgent.makeURI(config.sipUri);
    if (!uri) {
      this.callbacks.onError('Invalid SIP URI');
      this.callbacks.onDiagnostic({
        code: 'INVALID_SIP_URI',
        message: 'SIP URI 형식이 올바르지 않습니다.',
        hint: '콜센터 서버의 softphone SIP URI 설정을 확인하세요.',
        source: 'config',
        severity: 'error',
      });
      this.callbacks.onRegistrationState('error');
      return;
    }

    const delegate: UserAgentDelegate = {
      onConnect: () => this.callbacks.onTransportState('connected'),
      onDisconnect: () => {
        this.callbacks.onTransportState('not-connected');
        this.callbacks.onDiagnostic({
          code: 'TRANSPORT_DISCONNECTED',
          message: 'WSS 연결이 끊어졌습니다.',
          hint: 'PBX WSS 주소, 방화벽, 인증서 상태를 확인하세요.',
          source: 'transport',
          severity: 'warning',
        });
      },
      onInvite: (invitation) => {
        void this.handleIncomingInvitation(invitation);
      },
    };

    const userAgentOptions: UserAgentOptions = {
      uri,
      displayName: config.displayName,
      authorizationUsername: config.authorizationUsername,
      authorizationPassword: config.authorizationPassword,
      transportOptions: {
        server: config.wsServer,
      },
      delegate,
      sessionDescriptionHandlerFactoryOptions: {
        peerConnectionConfiguration: {
          iceServers: config.iceServers,
        },
      },
    };

    this.userAgent = new UserAgent(userAgentOptions);
    this.registerer = new Registerer(this.userAgent, {} as RegistererOptions);
    this.registerer.stateChange.addListener((state) => {
      switch (state) {
        case RegistererState.Registered:
          this.callbacks.onRegistrationState('registered');
          break;
        case RegistererState.Unregistered:
        case RegistererState.Terminated:
          this.callbacks.onRegistrationState('idle');
          break;
        default:
          break;
      }
    });

    this.callbacks.onTransportState('connecting');
    this.callbacks.onRegistrationState('registering');
    try {
      await this.userAgent.start();
      await this.registerer.register();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Softphone start failed';
      this.callbacks.onTransportState('error');
      this.callbacks.onRegistrationState('error');
      this.callbacks.onError(message);
      this.callbacks.onDiagnostic({
        code: 'REGISTER_FAILED',
        message: 'SIP 등록에 실패했습니다.',
        hint: '내선 인증 정보와 PBX SIP/WebRTC 응답을 확인하세요.',
        source: 'registration',
        severity: 'error',
      });
    }
  }

  async stop() {
    if (this.registerer) {
      await this.registerer.unregister();
    }
    if (this.userAgent) {
      await this.userAgent.stop();
    }
    this.userAgent = null;
    this.registerer = null;
    this.currentSession = null;
    this.callbacks.onRegistrationState('idle');
    this.callbacks.onTransportState('not-connected');
    this.callbacks.onCallState(null);
    this.callbacks.onRemoteStream(null);
  }

  async answer(audioPreferences?: DesktopAudioPreferences | null) {
    const currentSession = this.currentSession as (Invitation & {
      accept?: (options?: unknown) => Promise<void>;
    }) | null;
    if (!currentSession?.accept) {
      return;
    }

    const audioConstraints = audioPreferences
      ? {
          deviceId: audioPreferences.inputDeviceId ? { exact: audioPreferences.inputDeviceId } : undefined,
          echoCancellation: audioPreferences.echoCancellation,
          noiseSuppression: audioPreferences.noiseSuppression,
        }
      : true;

    await currentSession.accept({
      sessionDescriptionHandlerOptions: {
        constraints: {
          audio: audioConstraints,
          video: false,
        },
      },
    });
  }

  async reject() {
    const currentSession = this.currentSession as (Invitation & {
      reject?: () => Promise<void>;
    }) | null;
    if (!currentSession?.reject) {
      return;
    }

    await currentSession.reject();
    this.callbacks.onCallState(null);
    this.callbacks.onRemoteStream(null);
    this.currentSession = null;
  }

  async hangup() {
    const currentSession = this.currentSession as (Session & {
      bye?: () => Promise<unknown>;
      reject?: () => Promise<void>;
    }) | null;
    if (!currentSession) {
      return;
    }

    if (currentSession.state === SessionState.Initial && currentSession.reject) {
      await currentSession.reject();
    } else if (currentSession.bye) {
      await currentSession.bye();
    }
  }

  private async handleIncomingInvitation(invitation: Invitation) {
    if (this.currentSession && this.currentSession.state !== SessionState.Terminated) {
      await invitation.reject();
      return;
    }

    this.currentSession = invitation;
    this.currentDirection = 'incoming';
    this.bindSession(invitation, 'incoming');
    this.callbacks.onCallState(this.toCallState(invitation, 'incoming', 'ringing'));
  }

  private bindSession(session: Session | Invitation, direction: 'incoming' | 'outgoing') {
    const delegate: SessionDelegate = {
      onSessionDescriptionHandler: (sessionDescriptionHandler) => {
        const stream = this.extractRemoteStream(sessionDescriptionHandler as WebSessionDescriptionHandlerLike);
        if (stream) {
          this.callbacks.onRemoteStream(stream);
        }
      },
    };
    session.delegate = delegate;

    session.stateChange.addListener((state) => {
      switch (state) {
        case SessionState.Initial:
          this.callbacks.onCallState(this.toCallState(session, direction, direction === 'incoming' ? 'ringing' : 'establishing'));
          break;
        case SessionState.Establishing:
          this.callbacks.onCallState(this.toCallState(session, direction, 'establishing'));
          break;
        case SessionState.Established: {
          this.callbacks.onCallState(this.toCallState(session, direction, 'active'));
          const stream = this.extractRemoteStream(
            session.sessionDescriptionHandler as WebSessionDescriptionHandlerLike | undefined,
          );
          if (stream) {
            this.callbacks.onRemoteStream(stream);
          }
          break;
        }
        case SessionState.Terminating:
          this.callbacks.onCallState(this.toCallState(session, direction, 'terminating'));
          break;
        case SessionState.Terminated:
          this.callbacks.onCallState(null);
          this.callbacks.onRemoteStream(null);
          this.currentSession = null;
          break;
        default:
          break;
      }
    });
  }

  private toCallState(
    session: Session | Invitation,
    direction: 'incoming' | 'outgoing',
    phase: SoftphoneCallState['phase'],
  ): SoftphoneCallState {
    return {
      id: session.id,
      direction,
      phase,
      remoteDisplayName: session.remoteIdentity.displayName || session.remoteIdentity.uri.user || 'Unknown',
      remoteUri: session.remoteIdentity.uri?.toString?.() ?? null,
    };
  }

  private extractRemoteStream(sessionDescriptionHandler: WebSessionDescriptionHandlerLike | undefined) {
    if (!sessionDescriptionHandler) {
      return null;
    }

    if (sessionDescriptionHandler.remoteMediaStream) {
      return sessionDescriptionHandler.remoteMediaStream;
    }

    const audioTracks = sessionDescriptionHandler.peerConnection
      ?.getReceivers()
      .map((receiver) => receiver.track)
      .filter((track): track is MediaStreamTrack => Boolean(track) && track.kind === 'audio');

    if (!audioTracks?.length) {
      return null;
    }

    if (typeof MediaStream !== 'undefined') {
      return new MediaStream(audioTracks);
    }

    return {
      getTracks: () => audioTracks,
    } as MediaStream;
  }
}
