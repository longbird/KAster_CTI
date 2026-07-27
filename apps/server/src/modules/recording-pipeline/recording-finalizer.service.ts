import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { AmiLeaderElectionService } from '../redis/ami-leader-election.service';
import { RecordingEncryptionService } from './recording-encryption.service';
import { RecordingStorageService } from './recording-storage.service';

interface RecordingFinalizeJob {
  recordingFinalizeJobId: string;
  tenantId: string;
  callId: string;
  linkedid: string;
  recFile: string;
  attempts: number;
}

const DEFAULT_RETENTION_DAYS = 1095;
const MAX_JOBS_PER_SWEEP = 50;

@Injectable()
export class RecordingFinalizerService implements OnModuleInit {
  private readonly logger = new Logger(RecordingFinalizerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: RecordingStorageService,
    private readonly encryption: RecordingEncryptionService,
    private readonly eventBus: EventBusService,
    private readonly leader?: AmiLeaderElectionService,
  ) {}

  onModuleInit(): void {
    setInterval(() => this.sweep().catch((error) => this.logger.error(error.message)), 15000);
  }

  async sweep() {
    if (this.leader && !this.leader.isLeader()) return;

    const jobs = await (this.prisma as any).recordingFinalizeJobs.findMany({
      where: {
        status: { in: ['PENDING', 'RETRY'] },
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: MAX_JOBS_PER_SWEEP,
    });

    for (const job of jobs) {
      await this.finalizeJob(job);
    }
  }

  async enqueueForRecording(input: {
    tenantId: string;
    callId: string;
    linkedid: string;
    recFile: string;
  }) {
    await (this.prisma as any).recordingFinalizeJobs.upsert({
      where: {
        tenantId_linkedid_recFile: {
          tenantId: input.tenantId,
          linkedid: input.linkedid,
          recFile: input.recFile,
        },
      },
      create: {
        tenantId: input.tenantId,
        callId: input.callId,
        linkedid: input.linkedid,
        recFile: input.recFile,
        status: 'PENDING',
      },
      update: {
        callId: input.callId,
        status: 'PENDING',
        nextAttemptAt: new Date(),
        lastError: null,
      },
    });
  }

  async finalizeJob(job: RecordingFinalizeJob) {
    try {
      const inspected = await this.storage.inspectLocalFile(job.recFile);

      if (inspected.fileSizeBytes <= 0) {
        await this.saveRecording(job, {
          filePath: inspected.filePath,
          fileName: inspected.fileName,
          fileFormat: inspected.fileFormat,
          fileSizeBytes: BigInt(0),
          checksumSha256: inspected.checksumSha256,
          recordingStatus: 'FAILED_ZERO_BYTES',
          encryptionStatus: 'NONE',
          encryptedFilePath: null,
          keyRef: null,
          failureReason: 'recording file has zero bytes',
          finalizedAt: null,
          retentionUntil: await this.resolveRetentionUntil(job.tenantId),
        });
        await this.markSessionRecordingStatus(job.callId, 'FAILED', null, false);
        await this.markJobFailed(job, 'recording file has zero bytes');
        return;
      }

      const encrypted = await this.encryption.encryptFile(inspected.filePath);
      const finalizedAt = new Date();
      const saved = await this.saveRecording(job, {
        filePath: inspected.filePath,
        fileName: inspected.fileName,
        fileFormat: inspected.fileFormat,
        fileSizeBytes: BigInt(inspected.fileSizeBytes),
        checksumSha256: inspected.checksumSha256,
        recordingStatus: 'READY',
        encryptionStatus: encrypted.encryptionStatus,
        encryptedFilePath: encrypted.encryptedFilePath,
        keyRef: encrypted.keyRef,
        failureReason: null,
        finalizedAt,
        retentionUntil: await this.resolveRetentionUntil(job.tenantId),
      });

      await this.markSessionRecordingStatus(job.callId, 'FINALIZED', finalizedAt, true);
      await this.markJobCompleted(job);
      await this.eventBus?.publish?.('recording.ready', {
        tenantId: job.tenantId,
        callId: job.callId,
        linkedid: job.linkedid,
        recordingId: saved?.recordingId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.saveRecording(job, {
        filePath: this.storage.resolveLocalPath(job.recFile),
        fileName: this.fileNameFromRecFile(job.recFile),
        fileFormat: this.fileFormatFromRecFile(job.recFile),
        fileSizeBytes: null,
        checksumSha256: null,
        recordingStatus: 'MISSING',
        encryptionStatus: 'NONE',
        encryptedFilePath: null,
        keyRef: null,
        failureReason: `recording file not found or unreadable: ${message}`,
        finalizedAt: null,
        retentionUntil: await this.resolveRetentionUntil(job.tenantId),
      });
      await this.markSessionRecordingStatus(job.callId, 'RETRY_PENDING', null, false);
      await this.markJobRetry(job, message);
    }
  }

  private async saveRecording(job: RecordingFinalizeJob, data: Record<string, any>) {
    const existing = await (this.prisma as any).callRecordings.findFirst({
      where: {
        tenantId: job.tenantId,
        callId: job.callId,
        OR: [
          { filePath: data.filePath },
          { fileName: data.fileName },
        ],
      },
      select: { recordingId: true },
    });

    if (existing) {
      return (this.prisma as any).callRecordings.update({
        where: { recordingId: existing.recordingId },
        data,
      });
    }

    return (this.prisma as any).callRecordings.create({
      data: {
        tenantId: job.tenantId,
        callId: job.callId,
        linkedid: job.linkedid,
        recordingType: 'mixmonitor',
        durationSeconds: 0,
        storageProvider: 'local',
        recordingStartedAt: null,
        recordingEndedAt: null,
        isAccessRestricted: true,
        ...data,
      },
    });
  }

  private async resolveRetentionUntil(tenantId: string) {
    const policy = await (this.prisma as any).recordingRetentionPolicies.findUnique({
      where: { tenantId },
      select: { retentionDays: true, enabled: true },
    });
    if (policy && !policy.enabled) return null;

    const days = Math.max(1, policy?.retentionDays ?? DEFAULT_RETENTION_DAYS);
    return new Date(Date.now() + days * 86_400_000);
  }

  private async markJobCompleted(job: RecordingFinalizeJob) {
    await (this.prisma as any).recordingFinalizeJobs.update({
      where: { recordingFinalizeJobId: job.recordingFinalizeJobId },
      data: { status: 'COMPLETED', attempts: job.attempts + 1, lastError: null },
    });
  }

  private async markSessionRecordingStatus(
    callId: string,
    recordingFinalizationStatus: string,
    recordingFinalizedAt: Date | null,
    recordingFlag: boolean,
  ) {
    if (!(this.prisma as any).callSessions?.update) return;
    await (this.prisma as any).callSessions.update({
      where: { callId },
      data: {
        recordingFinalizationStatus,
        recordingFinalizedAt,
        recordingFlag,
      },
    });
  }

  private async markJobRetry(job: RecordingFinalizeJob, error: string) {
    await (this.prisma as any).recordingFinalizeJobs.update({
      where: { recordingFinalizeJobId: job.recordingFinalizeJobId },
      data: {
        status: 'RETRY',
        attempts: job.attempts + 1,
        nextAttemptAt: new Date(Date.now() + this.backoffMs(job.attempts + 1)),
        lastError: error.slice(0, 2000),
      },
    });
  }

  private async markJobFailed(job: RecordingFinalizeJob, error: string) {
    await (this.prisma as any).recordingFinalizeJobs.update({
      where: { recordingFinalizeJobId: job.recordingFinalizeJobId },
      data: {
        status: 'FAILED',
        attempts: job.attempts + 1,
        lastError: error.slice(0, 2000),
      },
    });
  }

  private backoffMs(attempts: number) {
    return Math.min(60, 2 ** Math.max(0, attempts - 1)) * 60_000;
  }

  private fileNameFromRecFile(recFile: string) {
    return recFile.replace(/\\/g, '/').split('/').pop() || 'recording.wav';
  }

  private fileFormatFromRecFile(recFile: string) {
    const fileName = this.fileNameFromRecFile(recFile);
    return fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || 'wav' : 'wav';
  }
}
