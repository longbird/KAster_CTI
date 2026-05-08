import {
  Inviter,
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
import { holdModifier } from 'sip.js/lib/platform/web/modifiers/index.js';
import type { DesktopAudioPreferences, DesktopSoftphoneConfig } from '../../../shared/ipc';
import type { SoftphoneCallState } from './softphone-runtime';

type RegistrationState = 'disabled' | 'idle' | 'registering' | 'registered' | 'error';
type TransportState = 'not-configured' | 'not-connected' | 'connecting' | 'connected' | 'error';

const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const STRIP_DOCKER_ICE_CANDIDATES = (description: RTCSessionDescriptionInit) => {
  if (!description.sdp) {
    return Promise.resolve(description);
  }

  const sdp = description.sdp
    .split(/\r\n/)
    .filter((line) => !/^a=candidate:.*\b(172\.(1[6-9]|2\d|3[0-1])\.)/.test(line))
    .join('\r\n');
  return Promise.resolve({ ...description, sdp });
};

interface WebSessionDescriptionHandlerLike {
  remoteMediaStream?: MediaStream & {
    addEventListener?: (type: string, listener: () => void) => void;
  };
  peerConnection?: {
    iceConnectionState?: RTCIceConnectionState;
    connectionState?: RTCPeerConnectionState;
    addEventListener?: (type: string, listener: () => void) => void;
    getStats?: () => Promise<RTCStatsReport>;
    getReceivers(): Array<{
      track?: MediaStreamTrack | null;
    }>;
    getSenders?: () => Array<{
      track?: MediaStreamTrack | null;
    }>;
  };
  sendDtmf?: (tones: string, options?: unknown) => boolean;
}

type CandidateStats = RTCStats & {
  address?: string;
  candidateType?: string;
  ip?: string;
  port?: number;
  protocol?: string;
};

export class SipSoftphoneClient {
  private userAgent: UserAgent | null = null;
  private registerer: Registerer | null = null;
  private currentSession: Session | Invitation | null = null;
  private currentDirection: 'incoming' | 'outgoing' = 'incoming';
  private sipDomain: string | null = null;
  private readonly reportedMediaDiagnostics = new Set<string>();
  private mediaStatsTimer: ReturnType<typeof setTimeout> | null = null;

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
        source: 'config' | 'transport' | 'registration' | 'media';
        severity: 'info' | 'warning' | 'error';
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
    this.sipDomain = extractSipDomain(config.sipUri);

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
          iceServers: config.iceServers.length > 0 ? config.iceServers : DEFAULT_ICE_SERVERS,
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
    this.sipDomain = null;
    this.clearMediaStatsTimer();
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
      sessionDescriptionHandlerModifiers: [STRIP_DOCKER_ICE_CANDIDATES],
      sessionDescriptionHandlerOptions: {
        constraints: {
          audio: audioConstraints,
          video: false,
        },
      },
    });
  }

  async invite(phoneNumber: string, audioPreferences?: DesktopAudioPreferences | null) {
    if (!this.userAgent || !this.sipDomain) {
      throw new Error('Softphone is not registered');
    }
    if (this.currentSession && this.currentSession.state !== SessionState.Terminated) {
      throw new Error('Softphone already has an active session');
    }

    const targetUri = UserAgent.makeURI(`sip:${phoneNumber}@${this.sipDomain}`);
    if (!targetUri) {
      throw new Error('Invalid outbound SIP target');
    }

    const audioConstraints = audioPreferences
      ? {
          deviceId: audioPreferences.inputDeviceId ? { exact: audioPreferences.inputDeviceId } : undefined,
          echoCancellation: audioPreferences.echoCancellation,
          noiseSuppression: audioPreferences.noiseSuppression,
        }
      : true;

    const inviter = new Inviter(this.userAgent, targetUri, {
      sessionDescriptionHandlerModifiers: [STRIP_DOCKER_ICE_CANDIDATES],
      sessionDescriptionHandlerOptions: {
        constraints: {
          audio: audioConstraints,
          video: false,
        },
      },
    });

    this.currentSession = inviter;
    this.currentDirection = 'outgoing';
    this.bindSession(inviter, 'outgoing');
    this.callbacks.onCallState(this.toCallState(inviter, 'outgoing', 'establishing'));
    await inviter.invite();
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

  setMuted(muted: boolean) {
    const audioTracks = this.getLocalAudioTracks();
    if (!audioTracks.length) {
      this.emitMediaDiagnosticOnce({
        code: 'MEDIA_LOCAL_AUDIO_CONTROL_MISSING',
        message: '제어할 마이크 오디오 트랙을 찾지 못했습니다.',
        hint: '통화가 연결된 뒤 다시 시도하거나 마이크 권한과 입력 장치를 확인하세요.',
        source: 'media',
        severity: 'error',
      });
      return false;
    }

    audioTracks.forEach((track) => {
      track.enabled = !muted;
    });
    return true;
  }

  async setHeld(held: boolean) {
    const currentSession = this.currentSession as (Session & {
      invite?: (options?: unknown) => Promise<unknown>;
    }) | null;
    if (!currentSession || currentSession.state !== SessionState.Established || !currentSession.invite) {
      this.emitMediaDiagnosticOnce({
        code: 'MEDIA_HOLD_SESSION_NOT_READY',
        message: '보류를 적용할 수 있는 연결된 SIP 세션이 없습니다.',
        hint: '통화 연결 상태를 확인한 뒤 다시 시도하세요.',
        source: 'media',
        severity: 'warning',
      });
      return false;
    }

    await currentSession.invite({
      sessionDescriptionHandlerModifiers: held ? [holdModifier] : [],
    });
    return true;
  }

  sendDtmf(digit: string) {
    if (!/^[0-9*#]$/.test(digit)) {
      throw new Error('Invalid DTMF digit');
    }

    const currentSession = this.currentSession;
    if (!currentSession || currentSession.state !== SessionState.Established) {
      this.emitMediaDiagnosticOnce({
        code: 'MEDIA_DTMF_SESSION_NOT_READY',
        message: 'DTMF 를 전송할 수 있는 연결된 SIP 세션이 없습니다.',
        hint: '통화가 연결된 뒤 다시 시도하세요.',
        source: 'media',
        severity: 'warning',
      });
      return false;
    }

    const sent = (currentSession.sessionDescriptionHandler as WebSessionDescriptionHandlerLike | undefined)
      ?.sendDtmf?.(digit, { duration: 160 });
    if (!sent) {
      this.emitMediaDiagnosticOnce({
        code: 'MEDIA_DTMF_SEND_FAILED',
        message: 'DTMF 전송에 실패했습니다.',
        hint: 'PBX/WebRTC DTMF(RFC4733) 지원 여부와 통화 미디어 상태를 확인하세요.',
        source: 'media',
        severity: 'error',
      });
      return false;
    }

    return true;
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
        const handler = sessionDescriptionHandler as WebSessionDescriptionHandlerLike;
        this.inspectMediaHandler(handler, false);
        this.bindPeerConnectionDiagnostics(handler);
        this.bindRemoteStreamTrackWakeup(handler);
        const stream = this.extractRemoteStream(handler);
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
          this.inspectMediaHandler(session.sessionDescriptionHandler as WebSessionDescriptionHandlerLike | undefined, true);
          this.scheduleMediaStatsDiagnostic(session.sessionDescriptionHandler as WebSessionDescriptionHandlerLike | undefined);
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
          this.reportedMediaDiagnostics.clear();
          this.clearMediaStatsTimer();
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
      remoteDisplayName: formatRemoteIdentity(session.remoteIdentity.displayName, session.remoteIdentity.uri),
      remoteUri: session.remoteIdentity.uri?.toString?.() ?? null,
    };
  }

  private inspectMediaHandler(sessionDescriptionHandler: WebSessionDescriptionHandlerLike | undefined, isEstablished: boolean) {
    const peerConnection = sessionDescriptionHandler?.peerConnection;
    if (!peerConnection) {
      return;
    }

    const localAudioTracks = peerConnection
      .getSenders?.()
      .map((sender) => sender.track)
      .filter((track): track is MediaStreamTrack => Boolean(track) && track.kind === 'audio') ?? [];

    if (isEstablished && !localAudioTracks.length) {
      this.emitMediaDiagnosticOnce({
        code: 'MEDIA_LOCAL_AUDIO_MISSING',
        message: '마이크 오디오 트랙이 통화에 포함되지 않았습니다.',
        hint: '마이크 권한과 입력 장치 선택을 확인한 뒤 다시 발신하세요.',
        source: 'media',
        severity: 'error',
      });
    }

    const remoteAudioTracks = peerConnection
      .getReceivers()
      .map((receiver) => receiver.track)
      .filter((track): track is MediaStreamTrack => Boolean(track) && track.kind === 'audio');

    if (isEstablished && !remoteAudioTracks.length && this.currentDirection === 'outgoing') {
      this.emitMediaDiagnosticOnce({
        code: 'MEDIA_REMOTE_AUDIO_MISSING',
        message: '상대방 오디오 트랙이 아직 수신되지 않았습니다.',
        hint: '통화 연결 직후 계속 유지되면 PBX RTP 경로와 상대 단말 미디어를 확인하세요.',
        source: 'media',
        severity: 'warning',
      });
    }
  }

  private getLocalAudioTracks() {
    return this.currentSession?.sessionDescriptionHandler
      ? ((this.currentSession.sessionDescriptionHandler as WebSessionDescriptionHandlerLike).peerConnection
          ?.getSenders?.()
          .map((sender) => sender.track)
          .filter((track): track is MediaStreamTrack => Boolean(track) && track.kind === 'audio') ?? [])
      : [];
  }

  private bindPeerConnectionDiagnostics(sessionDescriptionHandler: WebSessionDescriptionHandlerLike | undefined) {
    const peerConnection = sessionDescriptionHandler?.peerConnection;
    if (!peerConnection?.addEventListener) {
      return;
    }

    const notifyIceProblem = () => {
      const state = peerConnection.iceConnectionState;
      if (state !== 'failed' && state !== 'disconnected') {
        return;
      }

      this.emitMediaDiagnosticOnce({
        code: `MEDIA_ICE_${state.toUpperCase()}`,
        message: `WebRTC 미디어 연결 상태가 ${state} 입니다.`,
        hint: 'PBX RTP 포트, NAT, 방화벽, ICE 후보 교환 상태를 확인하세요.',
        source: 'media',
        severity: state === 'failed' ? 'error' : 'warning',
      });
      setTimeout(() => {
        void this.reportIceCandidatePair(peerConnection);
      }, 100);
    };

    peerConnection.addEventListener('iceconnectionstatechange', notifyIceProblem);
    peerConnection.addEventListener('connectionstatechange', notifyIceProblem);
  }

  private bindRemoteStreamTrackWakeup(sessionDescriptionHandler: WebSessionDescriptionHandlerLike | undefined) {
    const stream = sessionDescriptionHandler?.remoteMediaStream;
    if (!stream?.addEventListener) {
      return;
    }

    stream.addEventListener('addtrack', () => {
      this.callbacks.onRemoteStream(stream);
    });
  }

  private scheduleMediaStatsDiagnostic(sessionDescriptionHandler: WebSessionDescriptionHandlerLike | undefined) {
    const peerConnection = sessionDescriptionHandler?.peerConnection;
    if (!peerConnection?.getStats) {
      return;
    }

    this.clearMediaStatsTimer();
    this.mediaStatsTimer = setTimeout(() => {
      void this.reportMediaStats(peerConnection);
    }, 5000);
  }

  private async reportMediaStats(peerConnection: NonNullable<WebSessionDescriptionHandlerLike['peerConnection']>) {
    if (!peerConnection.getStats) {
      return;
    }

    const stats = await peerConnection.getStats();
    let inboundBytes = 0;
    let inboundPackets = 0;
    let outboundBytes = 0;
    let outboundPackets = 0;
    stats.forEach((report) => {
      const item = report as RTCInboundRtpStreamStats & RTCOutboundRtpStreamStats & { kind?: string; mediaType?: string };
      const mediaKind = item.kind ?? item.mediaType;
      if (mediaKind !== 'audio') {
        return;
      }
      if (item.type === 'inbound-rtp' && !item.isRemote) {
        inboundBytes += item.bytesReceived ?? 0;
        inboundPackets += item.packetsReceived ?? 0;
      }
      if (item.type === 'outbound-rtp' && !item.isRemote) {
        outboundBytes += item.bytesSent ?? 0;
        outboundPackets += item.packetsSent ?? 0;
      }
    });

    this.callbacks.onDiagnostic({
      code: 'MEDIA_RTP_STATS',
      message: `RTP audio stats inbound=${inboundBytes}/${inboundPackets}, outbound=${outboundBytes}/${outboundPackets}`,
      hint: inboundBytes > 0
        ? '데스크톱까지 오디오 패킷이 도착했고 마이크 송신도 확인됐습니다.'
        : '데스크톱에 수신 오디오 RTP가 도착하지 않았습니다. PBX RTP/NAT와 트렁크 미디어 방향을 확인하세요.',
      source: 'media',
      severity: inboundBytes > 0 ? 'info' : 'error',
    });
    await this.reportIceCandidatePair(peerConnection, inboundBytes > 0);
  }

  private async reportIceCandidatePair(
    peerConnection: NonNullable<WebSessionDescriptionHandlerLike['peerConnection']>,
    inboundRtpConfirmed = false,
  ) {
    if (!peerConnection.getStats) {
      return;
    }

    const stats = await peerConnection.getStats();
    const reports = new Map<string, RTCStats>();
    stats.forEach((report) => {
      reports.set(report.id, report);
    });

    let selectedPair: (RTCStats & {
      localCandidateId?: string;
      remoteCandidateId?: string;
      nominated?: boolean;
      selected?: boolean;
      state?: string;
      bytesSent?: number;
      bytesReceived?: number;
      currentRoundTripTime?: number;
    }) | null = null;

    stats.forEach((report) => {
      const pair = report as typeof selectedPair;
      if (report.type !== 'candidate-pair' || !pair) {
        return;
      }
      if (pair.selected || pair.nominated || pair.state === 'succeeded') {
        selectedPair = pair;
      }
    });

    if (!selectedPair) {
      stats.forEach((report) => {
        const transport = report as RTCStats & { selectedCandidatePairId?: string };
        if (report.type !== 'transport' || !transport.selectedCandidatePairId) {
          return;
        }
        const pair = reports.get(transport.selectedCandidatePairId) as typeof selectedPair;
        if (pair) {
          selectedPair = pair;
        }
      });
    }

    if (!selectedPair) {
      this.callbacks.onDiagnostic({
        code: 'MEDIA_ICE_CANDIDATE_PAIR',
        message: '선택된 ICE 후보쌍을 찾지 못했습니다.',
        hint: inboundRtpConfirmed
          ? 'RTP 수신이 확인되어 ICE 후보쌍 카운터는 참고 정보로만 표시합니다.'
          : 'ICE 연결이 후보 선택 전에 중단됐습니다. PC 방화벽, NAT, TURN 필요 여부를 확인하세요.',
        source: 'media',
        severity: inboundRtpConfirmed ? 'info' : 'error',
      });
      return;
    }

    const local = reports.get(selectedPair.localCandidateId ?? '') as CandidateStats | undefined;
    const remote = reports.get(selectedPair.remoteCandidateId ?? '') as CandidateStats | undefined;
    const pairHasReceivedBytes = Boolean(selectedPair.bytesReceived && selectedPair.bytesReceived > 0);
    this.callbacks.onDiagnostic({
      code: 'MEDIA_ICE_CANDIDATE_PAIR',
      message: `ICE pair ${selectedPair.state ?? 'unknown'} local=${formatCandidate(local)} remote=${formatCandidate(remote)} sent=${selectedPair.bytesSent ?? 0} recv=${selectedPair.bytesReceived ?? 0}`,
      hint: pairHasReceivedBytes
        ? 'ICE 후보쌍이 선택됐고 미디어 바이트 송수신이 확인됐습니다.'
        : inboundRtpConfirmed
          ? 'RTP 수신이 확인되어 ICE 후보쌍 카운터는 참고 정보로만 표시합니다.'
          : 'ICE 후보쌍에서 수신 바이트가 없습니다. PBX RTP 포트 또는 PC/공유기 UDP 경로를 확인하세요.',
      source: 'media',
      severity: pairHasReceivedBytes || inboundRtpConfirmed ? 'info' : 'error',
    });
  }

  private clearMediaStatsTimer() {
    if (!this.mediaStatsTimer) {
      return;
    }
    clearTimeout(this.mediaStatsTimer);
    this.mediaStatsTimer = null;
  }

  private emitMediaDiagnosticOnce(diagnostic: {
    code: string;
    message: string;
    hint: string | null;
    source: 'media';
    severity: 'info' | 'warning' | 'error';
  }) {
    if (this.reportedMediaDiagnostics.has(diagnostic.code)) {
      return;
    }

    this.reportedMediaDiagnostics.add(diagnostic.code);
    this.callbacks.onDiagnostic(diagnostic);
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

function extractSipDomain(sipUri: string) {
  const match = sipUri.match(/^sips?:[^@]+@([^;>\s]+)$/i);
  return match?.[1] ?? null;
}

function formatRemoteIdentity(displayName: string | undefined, uri: { user?: string; toString?: () => string } | undefined) {
  const normalizedName = displayName?.trim();
  if (normalizedName && normalizedName !== '<unknown>') {
    return normalizedName;
  }
  const user = uri?.user?.trim();
  if (user && user !== '<unknown>') {
    return user;
  }
  const uriText = uri?.toString?.() ?? '';
  const match = uriText.match(/^sips?:([^@;>\s]+)/i);
  return match?.[1] || '상대방';
}

function formatCandidate(candidate: CandidateStats | undefined) {
  if (!candidate) {
    return 'unknown';
  }
  const address = candidate.address ?? candidate.ip ?? 'unknown';
  const protocol = candidate.protocol ?? 'unknown';
  const type = candidate.candidateType ?? 'unknown';
  return `${type}/${protocol}/${address}:${candidate.port ?? 'unknown'}`;
}
