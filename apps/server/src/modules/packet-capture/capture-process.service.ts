import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { request as httpRequest } from 'http';

export interface StartAgentCaptureInput {
  jobId: string;
  interfaceName: string;
  captureFilter: string;
  durationSeconds: number;
  outputPath: string;
}

export interface AgentCaptureResult {
  jobId: string;
  exitCode: number | null;
  packetCount: number | null;
  stderr: string;
}

export interface AgentStatus {
  available: boolean;
  running: { jobId: string; startedAt: string } | null;
  lastResult: AgentCaptureResult | null;
}

/**
 * capture-agent 사이드카 클라이언트.
 *
 * server 컨테이너는 자체 네트워크 네임스페이스라서 호스트의 SIP/RTP 가 보이지 않는다.
 * 실제 dumpcap 은 network_mode: host + NET_RAW 를 가진 capture-agent 가 돌리고,
 * 여기서는 공유 볼륨의 유닉스 소켓으로 지시만 내린다. 포트는 열지 않는다.
 */
@Injectable()
export class CaptureProcessService {
  private readonly logger = new Logger(CaptureProcessService.name);

  constructor(private readonly config: ConfigService) {}

  private get socketPath(): string {
    return this.config.get<string>('CAPTURE_AGENT_SOCKET', '/var/run/kaster/capture.sock');
  }

  private get secret(): string {
    return this.config.get<string>('KASTER_INTERNAL_SECRET', '');
  }

  /** dumpcap 이 사이드카에서 실행 가능한지. 관리자 화면의 가용성 표시에 쓴다. */
  async isAvailable(): Promise<boolean> {
    try {
      const status = await this.call<AgentStatus>('GET', '/status');
      return status.available;
    } catch (error) {
      this.logger.debug(`capture-agent 사용 불가: ${(error as Error).message}`);
      return false;
    }
  }

  async getStatus(): Promise<AgentStatus | null> {
    try {
      return await this.call<AgentStatus>('GET', '/status');
    } catch (error) {
      this.logger.warn(`capture-agent 상태 조회 실패: ${(error as Error).message}`);
      return null;
    }
  }

  async listInterfaces(): Promise<string[]> {
    try {
      const payload = await this.call<{ interfaces: string[] }>('GET', '/interfaces');
      return payload.interfaces ?? [];
    } catch (error) {
      this.logger.warn(`인터페이스 목록 조회 실패: ${(error as Error).message}`);
      return [];
    }
  }

  async startCapture(input: StartAgentCaptureInput): Promise<void> {
    await this.call('POST', '/start', input);
  }

  async stopCapture(jobId: string): Promise<void> {
    await this.call('POST', '/stop', { jobId });
  }

  private call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const payload = body === undefined ? undefined : JSON.stringify(body);

    return new Promise<T>((resolve, reject) => {
      const req = httpRequest(
        {
          socketPath: this.socketPath,
          path,
          method,
          timeout: 10000,
          headers: {
            'content-type': 'application/json',
            'x-kaster-internal-secret': this.secret,
            ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
          },
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => {
            raw += chunk;
          });
          res.on('end', () => {
            let parsed: any = {};
            try {
              parsed = raw ? JSON.parse(raw) : {};
            } catch {
              return reject(new Error(`capture-agent 응답을 해석할 수 없습니다: ${raw.slice(0, 200)}`));
            }
            if ((res.statusCode ?? 500) >= 400) {
              return reject(new Error(parsed.error || `capture-agent 오류 (${res.statusCode})`));
            }
            resolve(parsed as T);
          });
        },
      );

      req.on('timeout', () => req.destroy(new Error('capture-agent 응답 시간 초과')));
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }
}
