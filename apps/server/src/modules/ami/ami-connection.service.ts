import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'net';
import { AmiEventNormalizerService } from './ami-event-normalizer.service';
import { SessionEngineService } from '../calls/session-engine.service';
import { AmiLeaderElectionService } from '../redis/ami-leader-election.service';

@Injectable()
export class AmiConnectionService implements OnModuleInit {
  private readonly logger = new Logger(AmiConnectionService.name);
  private socket: Socket | null = null;
  private connected = false;
  private loggedIn = false;
  private buffer = '';

  constructor(
    private readonly config: ConfigService,
    private readonly normalizer: AmiEventNormalizerService,
    private readonly sessionEngine: SessionEngineService,
    private readonly leader: AmiLeaderElectionService,
  ) {}

  onModuleInit(): void {
    this.connect();
  }

  connect() {
    const host = this.config.get<string>('AMI_HOST', '127.0.0.1');
    const port = Number(this.config.get<string>('AMI_PORT', '5038'));

    this.loggedIn = false;
    this.socket = new Socket();
    this.socket.connect(port, host, () => {
      this.connected = true;
      this.logger.log(`AMI connected ${host}:${port}`);
      // 주의: 연결 직후 Login 을 쏘지 말 것. Asterisk 는 먼저 배너
      // "Asterisk Call Manager/x.y.z\r\n" 를 송신한 뒤에만 Action 을 받는다.
      // 배너는 onData 에서 감지해 login() 을 호출한다.
    });

    this.socket.on('data', async (chunk) => {
      this.buffer += chunk.toString('utf8');

      // 배너는 ':' 없이 한 줄로 도착하므로 프레임 분리 전에 먼저 감지한다.
      if (!this.loggedIn && this.buffer.includes('Asterisk Call Manager')) {
        this.login();
        this.loggedIn = true;
      }

      let idx;
      while ((idx = this.buffer.indexOf('\r\n\r\n')) >= 0) {
        const raw = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 4);

        const normalized = this.normalizer.normalize(raw);
        if (!normalized?.eventName) continue;

        if (!this.leader.isLeader()) {
          // 리더가 아닌 노드는 TCP 연결은 유지해 장애 시 빠르게 takeover 할 수
          // 있도록 해두지만, DB/WS 정규화는 건너뛴다. conv 44 멀티노드 원칙.
          continue;
        }
        await this.sessionEngine.processNormalizedEvent(normalized);
      }
    });

    this.socket.on('close', () => {
      this.connected = false;
      this.loggedIn = false;
      this.logger.warn('AMI disconnected');
      setTimeout(
        () => this.connect(),
        Number(this.config.get<string>('AMI_RECONNECT_MS', '5000')),
      );
    });

    this.socket.on('error', (error) => {
      this.connected = false;
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

  isConnected() {
    return this.connected;
  }
}
