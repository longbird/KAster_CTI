import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import { PrismaService } from '../../common/prisma.service';
import { AmiLeaderElectionService } from '../redis/ami-leader-election.service';
import { PacketCaptureService } from './packet-capture.service';

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
/** 예정 종료 시각을 이만큼 넘긴 RUNNING 행을 마감 대상으로 본다. */
const OVERDUE_GRACE_SECONDS = 120;

@Injectable()
export class CaptureRetentionService implements OnModuleInit {
  private readonly logger = new Logger(CaptureRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leader: AmiLeaderElectionService,
    private readonly packetCapture: PacketCaptureService,
  ) {}

  onModuleInit(): void {
    setInterval(
      () => this.sweep().catch((error) => this.logger.error(error.message)),
      SWEEP_INTERVAL_MS,
    );
  }

  /**
   * 기한이 지난 RUNNING 행을 마감하고, 보존기한이 지난 캡처 파일을 지운다.
   * 노드 수만큼 중복 실행되지 않도록 리더에서만 돈다.
   */
  async sweep() {
    if (!this.leader.isLeader()) return;

    await this.settleOverdueJobs();
    await this.deleteExpiredCaptures();
  }

  /**
   * 서버가 재시작되면 마감 예약 타이머가 사라진다. 예정 종료 시각을 넘긴 작업을
   * 같은 마감 경로로 넘겨, 파일이 있으면 정상 완료시키고 없으면 실패로 닫는다.
   * (파일이 멀쩡한데도 실패로 처리해 버리면 애써 잡은 캡처를 잃는다.)
   */
  private async settleOverdueJobs() {
    const running = await (this.prisma as any).packetCaptureJobs.findMany({
      where: { status: 'RUNNING' },
      select: { packetCaptureJobId: true, startedAt: true, durationSeconds: true },
      take: 100,
    });

    const now = Date.now();
    for (const job of running) {
      const deadline =
        new Date(job.startedAt).getTime() + (job.durationSeconds + OVERDUE_GRACE_SECONDS) * 1000;
      if (now < deadline) continue;

      this.logger.warn(`기한 초과 캡처 마감 시도: ${job.packetCaptureJobId}`);
      await this.packetCapture.settleJob(job.packetCaptureJobId);
    }
  }

  private async deleteExpiredCaptures() {
    const expired = await (this.prisma as any).packetCaptureJobs.findMany({
      where: {
        status: 'COMPLETED',
        retentionUntil: { lte: new Date() },
      },
      select: {
        packetCaptureJobId: true,
        filePath: true,
        encryptedFilePath: true,
      },
      take: 100,
    });

    for (const job of expired) {
      await this.deleteIfPresent(job.filePath);
      await this.deleteIfPresent(job.encryptedFilePath);
      await (this.prisma as any).packetCaptureJobs.update({
        where: { packetCaptureJobId: job.packetCaptureJobId },
        data: { status: 'DELETED_BY_RETENTION' },
      });
    }
  }

  private async deleteIfPresent(filePath: string | null) {
    if (!filePath) return;
    try {
      await fs.unlink(filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
