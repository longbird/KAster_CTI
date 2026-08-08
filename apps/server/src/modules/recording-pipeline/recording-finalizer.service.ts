import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
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
const WAV_HEADER_BYTES = 44;

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
      const playback = await this.createPlaybackVariant(inspected.filePath, inspected.fileFormat);

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
          playbackFilePath: playback?.filePath ?? null,
          playbackFileFormat: playback?.fileFormat ?? null,
          playbackFileSizeBytes: playback ? BigInt(playback.fileSizeBytes) : null,
          encryptedPlaybackFilePath: null,
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
      const encryptedPlayback = playback
        ? await this.encryption.encryptFile(playback.filePath)
        : { encryptionStatus: 'NONE' as const, encryptedFilePath: null, keyRef: null };
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
        playbackFilePath: playback?.filePath ?? null,
        playbackFileFormat: playback?.fileFormat ?? null,
        playbackFileSizeBytes: playback ? BigInt(playback.fileSizeBytes) : null,
        encryptedPlaybackFilePath: encryptedPlayback.encryptedFilePath,
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
        playbackFilePath: null,
        playbackFileFormat: null,
        playbackFileSizeBytes: null,
        encryptedPlaybackFilePath: null,
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

  private async createPlaybackVariant(filePath: string, fileFormat: string) {
    if (fileFormat !== 'raw') {
      return null;
    }

    const playbackPath = filePath.replace(/\.raw$/i, '.wav');
    const stat = await fs.stat(filePath);
    await fs.mkdir(path.dirname(playbackPath), { recursive: true });
    await fs.writeFile(playbackPath, this.buildStereoPcmWavHeader(stat.size));
    await pipeline(createReadStream(filePath), createWriteStream(playbackPath, { flags: 'a' }));
    const playbackStat = await fs.stat(playbackPath);
    return {
      filePath: playbackPath,
      fileFormat: 'wav',
      fileSizeBytes: playbackStat.size,
    };
  }

  private buildStereoPcmWavHeader(dataSize: number) {
    const sampleRate = Math.max(1, Number.parseInt(process.env.RECORDING_STEREO_RAW_SAMPLE_RATE ?? '8000', 10));
    const bitsPerSample = Math.max(8, Number.parseInt(process.env.RECORDING_STEREO_RAW_BITS_PER_SAMPLE ?? '16', 10));
    const channels = 2;
    const blockAlign = channels * bitsPerSample / 8;
    const byteRate = sampleRate * blockAlign;
    const header = Buffer.alloc(WAV_HEADER_BYTES);

    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8, 'ascii');
    header.write('fmt ', 12, 'ascii');
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36, 'ascii');
    header.writeUInt32LE(dataSize, 40);
    return header;
  }
}
