import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma.service';
import { AmiLeaderElectionService } from '../redis/ami-leader-election.service';
import { RecordingEncryptionService } from '../recording-pipeline/recording-encryption.service';
import { RecordingStorageService } from '../recording-pipeline/recording-storage.service';
import { CaptureProcessService } from './capture-process.service';
import {
  CaptureValidationError,
  validateCaptureFilter,
  validateDurationSeconds,
  validateInterfaceName,
} from './capture-filter.util';

/** dumpcap 이 파일을 닫을 시간을 준 뒤 마감한다. */
const SETTLE_GRACE_MS = 3000;

export interface StartCaptureInput {
  interfaceName?: string;
  captureFilter?: string;
  durationSeconds: number;
}

export interface CaptureAuditContext {
  agentId?: string | null;
  userRole?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class PacketCaptureService {
  private readonly logger = new Logger(PacketCaptureService.name);

  /**
   * 마감 예약 타이머. 프로세스가 재시작되면 사라지므로, 이 맵에만 의존하지 않는다.
   * 기한이 지난 RUNNING 행은 CaptureRetentionService 의 sweep 이 같은 경로로 마감한다.
   */
  private readonly settleTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly leader: AmiLeaderElectionService,
    private readonly captureProcess: CaptureProcessService,
    private readonly encryption: RecordingEncryptionService,
    private readonly storage: RecordingStorageService,
  ) {}

  private get hardEnabled(): boolean {
    return this.config.get<string>('PACKET_CAPTURE_ENABLED', 'false') === 'true';
  }

  private get storageRoot(): string {
    return this.config.get<string>('PACKET_CAPTURE_STORAGE_ROOT', '/var/spool/kaster/packet-capture');
  }

  private get defaultInterface(): string {
    return this.config.get<string>('PACKET_CAPTURE_INTERFACE', 'any');
  }

  private get maxDurationSeconds(): number {
    return Number(this.config.get<string>('PACKET_CAPTURE_MAX_DURATION_SECONDS', '600'));
  }

  private get retentionDays(): number {
    return Number(this.config.get<string>('PACKET_CAPTURE_RETENTION_DAYS', '7'));
  }

  private get nodeId(): string {
    return this.config.get<string>('ASTERISK_NODE_ID', 'node-1');
  }

  /** 관리자 화면이 토글과 함께 "지금 캡처가 가능한 상태인가" 를 판단할 재료를 준다. */
  async getSettings(tenantId: string) {
    const [settings, dumpcapAvailable, interfaces] = await Promise.all([
      this.findSettings(tenantId),
      this.captureProcess.isAvailable(),
      this.captureProcess.listInterfaces(),
    ]);

    return {
      enabled: settings?.packetCaptureEnabled ?? false,
      hardEnabled: this.hardEnabled,
      dumpcapAvailable,
      isLeaderNode: this.leader.isLeader(),
      encryptionEnabled: this.encryption.isEnabled(),
      interfaces,
      defaultInterface: this.defaultInterface,
      maxDurationSeconds: this.maxDurationSeconds,
      retentionDays: this.retentionDays,
      nodeId: this.nodeId,
    };
  }

  async updateSettings(tenantId: string, enabled: boolean) {
    await (this.prisma as any).tenantSystemSettings.updateMany({
      where: { tenantId },
      data: { packetCaptureEnabled: enabled },
    });
    return this.getSettings(tenantId);
  }

  async listJobs(tenantId: string, limit = 50) {
    return (this.prisma as any).packetCaptureJobs.findMany({
      where: { tenantId },
      orderBy: { startedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  /**
   * 시한부 캡처를 시작한다.
   *
   * 게이트는 네 겹이다: 하드 킬스위치(env) → 테넌트 토글 → 리더 노드 → 중복 실행.
   * 어느 하나라도 막히면 사이드카에 지시를 보내지 않는다.
   */
  async startCapture(tenantId: string, input: StartCaptureInput, audit: CaptureAuditContext) {
    if (!this.hardEnabled) {
      throw new ForbiddenException('이 서버에서 패킷 캡처가 비활성화돼 있습니다 (PACKET_CAPTURE_ENABLED)');
    }

    const settings = await this.findSettings(tenantId);
    if (!settings?.packetCaptureEnabled) {
      throw new ForbiddenException('패킷 캡처가 꺼져 있습니다. 시스템 설정에서 먼저 켜주세요');
    }

    if (!this.leader.isLeader()) {
      throw new ServiceUnavailableException('이 노드는 리더가 아니라 캡처를 시작할 수 없습니다');
    }

    const existing = await (this.prisma as any).packetCaptureJobs.findFirst({
      where: { tenantId, status: 'RUNNING' },
    });
    if (existing) {
      throw new ConflictException('이미 실행 중인 캡처가 있습니다. 먼저 중지해주세요');
    }

    const interfaces = await this.captureProcess.listInterfaces();
    if (!interfaces.length) {
      throw new ServiceUnavailableException(
        '캡처 가능한 인터페이스가 없습니다. capture-agent 컨테이너와 NET_RAW 권한을 확인하세요',
      );
    }

    let interfaceName: string;
    let captureFilter: string;
    let durationSeconds: number;
    try {
      interfaceName = validateInterfaceName(input.interfaceName || this.defaultInterface, interfaces);
      captureFilter = validateCaptureFilter(input.captureFilter);
      durationSeconds = validateDurationSeconds(input.durationSeconds, this.maxDurationSeconds);
    } catch (error) {
      if (error instanceof CaptureValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const startedAt = new Date();
    const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
    // 출력 경로는 서버가 만든다. 클라이언트 입력은 파일명에 절대 들어가지 않는다.
    const outputPath = path.join(this.storageRoot, `capture-${stamp}-${tenantId.slice(0, 8)}.pcap`);

    const job = await (this.prisma as any).packetCaptureJobs.create({
      data: {
        tenantId,
        nodeId: this.nodeId,
        status: 'RUNNING',
        requestedBy: audit.agentId ?? null,
        interfaceName,
        captureFilter,
        durationSeconds,
        startedAt,
        filePath: outputPath,
      },
    });

    try {
      await this.captureProcess.startCapture({
        jobId: job.packetCaptureJobId,
        interfaceName,
        captureFilter,
        durationSeconds,
        outputPath,
      });
    } catch (error) {
      // 사이드카가 거절하면 RUNNING 행이 남아 다음 캡처를 막는다. 즉시 마감한다.
      await this.markEnded(job.packetCaptureJobId, 'FAILED', (error as Error).message);
      throw new ServiceUnavailableException(`캡처를 시작하지 못했습니다: ${(error as Error).message}`);
    }

    this.scheduleSettle(job.packetCaptureJobId, durationSeconds * 1000 + SETTLE_GRACE_MS);
    await this.writeAudit(tenantId, job.packetCaptureJobId, 'START', audit);
    return job;
  }

  async stopCapture(tenantId: string, packetCaptureJobId: string, audit: CaptureAuditContext) {
    const job = await this.findJob(tenantId, packetCaptureJobId);
    if (job.status !== 'RUNNING') {
      throw new ConflictException('실행 중인 캡처가 아닙니다');
    }

    try {
      await this.captureProcess.stopCapture(packetCaptureJobId);
    } catch (error) {
      // 사이드카가 모르는 작업이면 프로세스는 이미 없다. 상태만 정리한다.
      this.logger.warn(`캡처 중지 요청 실패: ${(error as Error).message}`);
    }

    this.scheduleSettle(packetCaptureJobId, SETTLE_GRACE_MS);
    await this.writeAudit(tenantId, packetCaptureJobId, 'STOP', audit);
    return { stopped: true };
  }

  /** 다운로드용 스트림. 암호화돼 있으면 복호화해서 넘긴다. */
  async openDownload(tenantId: string, packetCaptureJobId: string, audit: CaptureAuditContext) {
    const job = await this.findJob(tenantId, packetCaptureJobId);
    if (job.status !== 'COMPLETED') {
      throw new ConflictException('완료된 캡처만 내려받을 수 있습니다');
    }

    const fileName = path.basename(job.filePath ?? `${packetCaptureJobId}.pcap`);
    await this.writeAudit(tenantId, packetCaptureJobId, 'DOWNLOAD', audit);

    if (job.encryptionStatus === 'ENCRYPTED' && job.encryptedFilePath) {
      const decrypted = await this.encryption.openDecryptedReadStream(job.encryptedFilePath);
      return { fileName, stream: decrypted.stream };
    }

    return { fileName, stream: createReadStream(job.filePath) };
  }

  /**
   * 캡처를 마감한다. 예약 타이머와 sweep 이 같은 경로를 쓴다.
   * 이미 마감된 작업은 조용히 건너뛴다.
   */
  async settleJob(packetCaptureJobId: string) {
    this.clearSettleTimer(packetCaptureJobId);

    const job = await (this.prisma as any).packetCaptureJobs.findUnique({
      where: { packetCaptureJobId },
    });
    if (!job || job.status !== 'RUNNING') return;

    const status = await this.captureProcess.getStatus();
    if (status?.running?.jobId === packetCaptureJobId) {
      // 아직 돌고 있다. 다음 sweep 이 다시 본다.
      return;
    }
    const agentResult =
      status?.lastResult?.jobId === packetCaptureJobId ? status.lastResult : null;

    try {
      const stat = await fs.stat(job.filePath);
      const checksumSha256 = await this.storage.calculateSha256(job.filePath);
      // encryptFile 은 암호화에 성공하면 평문을 스스로 지운다.
      const encrypted = await this.encryption.encryptFile(job.filePath);

      const retentionUntil = new Date();
      retentionUntil.setDate(retentionUntil.getDate() + this.retentionDays);

      await (this.prisma as any).packetCaptureJobs.update({
        where: { packetCaptureJobId },
        data: {
          status: 'COMPLETED',
          endedAt: new Date(),
          fileSizeBytes: BigInt(stat.size),
          packetCount: agentResult?.packetCount ?? null,
          checksumSha256,
          encryptionStatus: encrypted.encryptionStatus,
          encryptedFilePath: encrypted.encryptedFilePath,
          retentionUntil,
        },
      });
    } catch (error) {
      await this.markEnded(
        packetCaptureJobId,
        'FAILED',
        `${(error as Error).message} | agent: ${(agentResult?.stderr ?? '').slice(-500)}`,
      );
    }
  }

  private scheduleSettle(packetCaptureJobId: string, delayMs: number) {
    this.clearSettleTimer(packetCaptureJobId);
    const timer = setTimeout(() => {
      this.settleJob(packetCaptureJobId).catch((error) =>
        this.logger.error(`캡처 마감 실패: ${error.message}`),
      );
    }, delayMs);
    // 마감 대기가 프로세스 종료를 붙잡지 않게 한다.
    timer.unref?.();
    this.settleTimers.set(packetCaptureJobId, timer);
  }

  private clearSettleTimer(packetCaptureJobId: string) {
    const timer = this.settleTimers.get(packetCaptureJobId);
    if (timer) {
      clearTimeout(timer);
      this.settleTimers.delete(packetCaptureJobId);
    }
  }

  private async markEnded(packetCaptureJobId: string, status: string, failureReason: string | null) {
    await (this.prisma as any).packetCaptureJobs.update({
      where: { packetCaptureJobId },
      data: { status, endedAt: new Date(), failureReason },
    });
  }

  private async findSettings(tenantId: string) {
    return (this.prisma as any).tenantSystemSettings.findFirst({ where: { tenantId } });
  }

  private async findJob(tenantId: string, packetCaptureJobId: string) {
    const job = await (this.prisma as any).packetCaptureJobs.findFirst({
      where: { tenantId, packetCaptureJobId },
    });
    if (!job) {
      throw new NotFoundException('캡처 작업을 찾을 수 없습니다');
    }
    return job;
  }

  private async writeAudit(
    tenantId: string,
    packetCaptureJobId: string,
    action: string,
    audit: CaptureAuditContext,
  ) {
    await (this.prisma as any).packetCaptureAccessAuditLogs.create({
      data: {
        tenantId,
        packetCaptureJobId,
        agentId: audit.agentId ?? null,
        userRole: audit.userRole ?? null,
        action,
        clientIp: audit.clientIp ?? null,
        userAgent: audit.userAgent ?? null,
        success: true,
      },
    });
  }
}
