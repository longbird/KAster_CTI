import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'net';
import { AmiEventNormalizerService } from './ami-event-normalizer.service';
import { isAsteriskBanner, parseAmiFrame, ParsedAmiFrame, splitAmiFrames } from './ami.parser';
import { SessionEngineService } from '../calls/session-engine.service';
import { AmiLeaderElectionService } from '../redis/ami-leader-election.service';
import { SipSecurityService } from '../sip-security/sip-security.service';
import { DurableSpoolService, SpoolAppendResult } from '../resilience/durable-spool.service';
import { OperatingModeService } from '../resilience/operating-mode.service';
import { computeFingerprint } from '../calls/session-engine.service';

export interface AmiHealthSnapshot {
  connected: boolean;
  loggedIn: boolean;
  lastEventAt: string | null;
  lastConnectAt: string | null;
  reconnectCount: number;
}

interface PendingAmiAction {
  eventList: boolean;
  resolve: (frames: ParsedAmiFrame[]) => void;
  reject: (error: Error) => void;
  frames: ParsedAmiFrame[];
  timeout: NodeJS.Timeout;
}

@Injectable()
export class AmiConnectionService implements OnModuleInit {
  private readonly logger = new Logger(AmiConnectionService.name);
  private socket: Socket | null = null;
  private connected = false;
  private loggedIn = false;
  private buffer = '';
  private lastEventAt: Date | null = null;
  private lastConnectAt: Date | null = null;
  private reconnectCount = 0;
  private readonly pendingActions = new Map<string, PendingAmiAction>();

  constructor(
    private readonly config: ConfigService,
    private readonly normalizer: AmiEventNormalizerService,
    private readonly sessionEngine: SessionEngineService,
    private readonly leader: AmiLeaderElectionService,
    private readonly sipSecurity: SipSecurityService,
    private readonly durableSpool: DurableSpoolService,
    private readonly operatingMode: OperatingModeService,
  ) {}

  onModuleInit(): void {
    this.connect();
  }

  /**
   * 정규화된 AMI 이벤트 한 건을 처리한다.
   *
   * 스풀 기록은 리더 게이트보다 앞이지만, **아무 노드나 쓰지는 않는다.**
   *
   *   리더                       → 쓴다 (정상 경로)
   *   비리더 + 리더십 확인됨      → 쓰지 않는다 (리더가 이미 쓴다)
   *   비리더 + 리더십 확인 불가   → 쓴다 (Redis 장애. 아무도 리더가 아니다)
   *
   * 모든 노드가 항상 쓰면 공유 Redis Stream 이 오염된다. 리더는 자기 append 의 stream
   * ID 로 커서를 올리는데, 비리더 append 가 그보다 뒤 ID 를 받으면 커서 뒤에 영구히
   * 남아 offline depth 가 절대 0 이 되지 않는다. 유실은 아니지만 지표가 죽고 불필요한
   * replay 가 반복된다.
   *
   * 마지막 경우(Redis 장애)에는 Redis append 가 어차피 실패해 로컬 스풀로 떨어지므로
   * 공유 스트림을 오염시키지 않는다. 즉 "모두 쓰기" 가 필요한 유일한 구간에서만 쓴다.
   */
  private async handleNormalizedEvent(normalized: Record<string, any>): Promise<void> {
    const isLeader = this.leader.isLeader();
    // 리더십을 확인할 수 없다 = 누가 리더인지 모른다. 그 구간에는 아무도 리더가 아니므로
    // 이벤트를 보존할 노드도 없다. 이때만 비리더도 보존 책임을 진다.
    const mustPreserve = isLeader || !this.leader.isLeadershipKnown();

    let appended: SpoolAppendResult | null = null;
    if (mustPreserve) {
      const fingerprint = computeFingerprint(normalized);
      appended = await this.durableSpool.appendAmiEvent(normalized, fingerprint);
    }

    if (!isLeader) {
      // 리더가 아닌 노드는 TCP 연결은 유지해 장애 시 빠르게 takeover 할 수
      // 있도록 해두지만, DB/WS 반영은 건너뛴다. conv 44 멀티노드 원칙.
      return;
    }

    try {
      await this.sipSecurity.processAmiEvent(normalized);
      await this.sessionEngine.processNormalizedEvent(normalized);

      // DB 쓰기가 성공했다는 가장 신뢰할 만한 신호. NORMAL 이면 no-op 이다.
      this.operatingMode.recordDbRecovered();
      if (appended) {
        await this.durableSpool.markProcessed(normalized.tenantId, appended);
      }
    } catch (err) {
      // 여기서 throw 하면 socket 'data' 핸들러의 unhandled rejection 이 된다.
      // 스풀 커서를 전진시키지 않았으므로 이 이벤트는 복구 후 재처리 대상으로 남는다.
      this.operatingMode.recordDbFailure();
      // 커서를 얼린다. 이 이벤트를 넘어 커서가 전진하면 재처리 대상에서 빠진다.
      if (appended) {
        this.durableSpool.markFailed(normalized.tenantId, appended);
      }
      this.logger.error(
        `event processing failed (${normalized.eventName}): ${(err as Error).message}`,
      );
    }
  }

  connect() {
    const host = this.config.get<string>('AMI_HOST', '127.0.0.1');
    const port = Number(this.config.get<string>('AMI_PORT', '5038'));

    this.loggedIn = false;
    this.socket = new Socket();
    this.socket.connect(port, host, () => {
      this.connected = true;
      this.lastConnectAt = new Date();
      this.logger.log(`AMI connected ${host}:${port}`);
      // 주의: 연결 직후 Login 을 쏘지 말 것. Asterisk 는 먼저 배너
      // "Asterisk Call Manager/x.y.z\r\n" 를 송신한 뒤에만 Action 을 받는다.
      // 배너는 onData 에서 감지해 login() 을 호출한다.
    });

    this.socket.on('data', async (chunk) => {
      this.buffer += chunk.toString('utf8');

      // 배너는 ':' 없이 한 줄로 도착하므로 프레임 분리 전에 먼저 감지한다.
      if (!this.loggedIn && isAsteriskBanner(this.buffer)) {
        this.login();
        this.loggedIn = true;
      }

      const { frames, rest } = splitAmiFrames(this.buffer);
      this.buffer = rest;

      for (const raw of frames) {
        const parsed = parseAmiFrame(raw);
        if (this.handlePendingActionFrame(parsed)) {
          continue;
        }

        const normalized = this.normalizer.normalize(raw);
        if (!normalized?.eventName) continue;

        this.lastEventAt = new Date();

        await this.handleNormalizedEvent(normalized);
      }
    });

    this.socket.on('close', () => {
      this.connected = false;
      this.loggedIn = false;
      this.reconnectCount += 1;
      this.failPendingActions(new Error('AMI disconnected'));
      this.logger.warn('AMI disconnected');
      setTimeout(
        () => this.connect(),
        Number(this.config.get<string>('AMI_RECONNECT_MS', '5000')),
      );
    });

    this.socket.on('error', (error) => {
      this.connected = false;
      this.failPendingActions(error instanceof Error ? error : new Error(String(error)));
      this.logger.error(error.message);
    });
  }

  private login() {
    const username = this.config.get<string>('AMI_USERNAME', 'cti_middleware');
    const secret = this.config.get<string>('AMI_SECRET', 'STRONG_AMI_PASSWORD');
    this.sendAction({
      Action: 'Login',
      Username: username,
      Secret: secret,
      Events: 'on',
    });
  }

  sendAction(action: Record<string, any>) {
    if (!this.socket || !this.connected) return;
    const payload =
      Object.entries(action)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\r\n') + '\r\n\r\n';
    this.socket.write(payload);
  }

  async sendActionWithResponse(
    action: Record<string, any>,
    options?: { eventList?: boolean; timeoutMs?: number },
  ): Promise<ParsedAmiFrame[]> {
    if (!this.socket || !this.connected) {
      throw new Error('AMI is not connected');
    }

    const actionId = `codex-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const timeoutMs = options?.timeoutMs ?? 5000;
    const eventList = options?.eventList ?? false;

    return await new Promise<ParsedAmiFrame[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingActions.delete(actionId);
        reject(new Error(`AMI action timeout: ${action.Action ?? 'unknown'}`));
      }, timeoutMs);

      this.pendingActions.set(actionId, {
        eventList,
        resolve,
        reject,
        frames: [],
        timeout,
      });

      this.sendAction({ ...action, ActionID: actionId });
    });
  }

  private handlePendingActionFrame(frame: ParsedAmiFrame): boolean {
    const actionId = frame.ActionID;
    let pending: PendingAmiAction | undefined;
    let pendingKey: string | undefined;

    if (actionId) {
      pending = this.pendingActions.get(actionId);
      pendingKey = actionId;
    } else if (this.pendingActions.size === 1 && this.isEventListFrame(frame)) {
      const [firstKey, firstPending] = Array.from(this.pendingActions.entries())[0];
      if (firstPending.eventList) {
        pending = firstPending;
        pendingKey = firstKey;
      }
    }

    if (!pending || !pendingKey) return false;

    pending.frames.push(frame);

    if (frame.Response === 'Error') {
      this.finishPendingAction(pendingKey, pending);
      return true;
    }

    if (!pending.eventList) {
      this.finishPendingAction(pendingKey, pending);
      return true;
    }

    if (frame.EventList === 'Complete' || frame.Event === 'ContactListComplete' || frame.Event === 'EndpointListComplete') {
      this.finishPendingAction(pendingKey, pending);
      return true;
    }

    return true;
  }

  private isEventListFrame(frame: ParsedAmiFrame) {
    return ['ContactList', 'ContactListComplete', 'EndpointList', 'EndpointListComplete'].includes(
      frame.Event ?? '',
    );
  }

  private finishPendingAction(actionId: string, pending: PendingAmiAction) {
    clearTimeout(pending.timeout);
    this.pendingActions.delete(actionId);
    pending.resolve(pending.frames);
  }

  private failPendingActions(error: Error) {
    for (const [actionId, pending] of this.pendingActions.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pendingActions.delete(actionId);
    }
  }

  isConnected() {
    return this.connected;
  }

  // 운영용 스냅샷. HealthController.detailed 와 관리자 대시보드에서 사용.
  getHealth(): AmiHealthSnapshot {
    return {
      connected: this.connected,
      loggedIn: this.loggedIn,
      lastEventAt: this.lastEventAt ? this.lastEventAt.toISOString() : null,
      lastConnectAt: this.lastConnectAt ? this.lastConnectAt.toISOString() : null,
      reconnectCount: this.reconnectCount,
    };
  }
}
