import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { AmiLeaderElectionService } from '../redis/ami-leader-election.service';
import { AnalysisService } from './analysis.service';
import { TranscriptionService } from './transcription.service';

const DEFAULT_SWEEP_MS = 15000;
const DEFAULT_MAX_JOBS_PER_SWEEP = 5;
const DEFAULT_MAX_ATTEMPTS = 5;
const MAX_ERROR_CHARS = 2000;

interface CallAnalysisJob {
  callAnalysisJobId: string;
  tenantId: string;
  callId: string;
  recordingId: string;
  stage: string;
  attempts: number;
}

export interface EnqueueAnalysisInput {
  tenantId: string;
  callId: string;
  recordingId: string;
}

/**
 * 통화 분석 job 을 주기적으로 소비한다.
 *
 * 녹취 확정 sweep 과 분리한 이유는 STT 지연이 녹취 확정을 막으면 안 되기 때문이다.
 * 멀티노드에서 중복 실행되지 않도록 리더 가드를 건다.
 */
@Injectable()
export class CallAnalysisSweeperService implements OnModuleInit {
  private readonly logger = new Logger(CallAnalysisSweeperService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly transcription: TranscriptionService,
    private readonly analysis: AnalysisService,
    private readonly leader?: AmiLeaderElectionService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log('call analysis is disabled (CALL_ANALYSIS_ENABLED)');
      return;
    }

    const intervalMs = this.numberFromEnv('CALL_ANALYSIS_SWEEP_MS', DEFAULT_SWEEP_MS);
    setInterval(() => this.sweep().catch((error) => this.logger.error(error.message)), intervalMs);
  }

  async sweep(): Promise<void> {
    if (!this.isEnabled()) return;
    if (this.leader && !this.leader.isLeader()) return;

    const jobs: CallAnalysisJob[] = await (this.prisma as any).callAnalysisJobs.findMany({
      where: {
        status: { in: ['PENDING', 'RETRY'] },
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: this.numberFromEnv('CALL_ANALYSIS_MAX_JOBS_PER_SWEEP', DEFAULT_MAX_JOBS_PER_SWEEP),
    });

    for (const job of jobs) {
      await this.runJob(job);
    }
  }

  async enqueue(input: EnqueueAnalysisInput): Promise<void> {
    if (!this.isEnabled()) return;

    await (this.prisma as any).callAnalysisJobs.upsert({
      where: {
        tenantId_callId_recordingId: {
          tenantId: input.tenantId,
          callId: input.callId,
          recordingId: input.recordingId,
        },
      },
      create: {
        tenantId: input.tenantId,
        callId: input.callId,
        recordingId: input.recordingId,
        stage: 'TRANSCRIBE',
        status: 'PENDING',
      },
      update: {
        stage: 'TRANSCRIBE',
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
        lastError: null,
      },
    });
  }

  private async runJob(job: CallAnalysisJob): Promise<void> {
    const target = {
      tenantId: job.tenantId,
      callId: job.callId,
      recordingId: job.recordingId,
    };

    try {
      if (job.stage === 'TRANSCRIBE') {
        await this.transcription.transcribe(target);
        await this.advanceToAnalyze(job);
        return;
      }

      if (job.stage === 'ANALYZE') {
        await this.analysis.analyze(target);
        await this.markCompleted(job);
        return;
      }

      await this.markFailed(job, `unknown call analysis stage: ${job.stage}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = job.attempts + 1;
      const maxAttempts = this.numberFromEnv('CALL_ANALYSIS_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS);

      if (attempts >= maxAttempts) {
        this.logger.error(`call analysis gave up call=${job.callId} stage=${job.stage}: ${message}`);
        await this.markFailed(job, message, attempts);
        return;
      }

      this.logger.warn(`call analysis retry call=${job.callId} stage=${job.stage}: ${message}`);
      await this.updateJob(job, {
        status: 'RETRY',
        attempts,
        nextAttemptAt: new Date(Date.now() + this.backoffMs(attempts)),
        lastError: message.slice(0, MAX_ERROR_CHARS),
      });
    }
  }

  private async advanceToAnalyze(job: CallAnalysisJob) {
    await this.updateJob(job, {
      stage: 'ANALYZE',
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: new Date(),
      lastError: null,
    });
  }

  private async markCompleted(job: CallAnalysisJob) {
    await this.updateJob(job, {
      status: 'COMPLETED',
      attempts: job.attempts + 1,
      lastError: null,
    });
  }

  private async markFailed(job: CallAnalysisJob, error: string, attempts?: number) {
    await this.updateJob(job, {
      status: 'FAILED',
      attempts: attempts ?? job.attempts + 1,
      lastError: error.slice(0, MAX_ERROR_CHARS),
    });
  }

  private async updateJob(job: CallAnalysisJob, data: Record<string, unknown>) {
    await (this.prisma as any).callAnalysisJobs.update({
      where: { callAnalysisJobId: job.callAnalysisJobId },
      data,
    });
  }

  private backoffMs(attempts: number): number {
    return Math.min(60, 2 ** Math.max(0, attempts - 1)) * 60_000;
  }

  private isEnabled(): boolean {
    return this.config.get<string>('CALL_ANALYSIS_ENABLED', 'false') === 'true';
  }

  private numberFromEnv(key: string, fallback: number): number {
    const parsed = Number.parseInt(this.config.get<string>(key, String(fallback)) ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
