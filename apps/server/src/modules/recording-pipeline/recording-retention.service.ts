import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import { PrismaService } from '../../common/prisma.service';
import { AmiLeaderElectionService } from '../redis/ami-leader-election.service';

@Injectable()
export class RecordingRetentionService implements OnModuleInit {
  private readonly logger = new Logger(RecordingRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leader: AmiLeaderElectionService,
  ) {}

  onModuleInit(): void {
    setInterval(() => this.sweep().catch((error) => this.logger.error(error.message)), 60 * 60 * 1000);
  }

  async sweep() {
    if (!this.leader.isLeader()) return;

    const expired = await (this.prisma as any).callRecordings.findMany({
      where: {
        recordingStatus: 'READY',
        retentionUntil: { lte: new Date() },
      },
      select: {
        recordingId: true,
        filePath: true,
        encryptedFilePath: true,
        playbackFilePath: true,
        encryptedPlaybackFilePath: true,
      },
      take: 100,
    });

    for (const recording of expired) {
      await this.deleteIfPresent(recording.filePath);
      if (recording.encryptedFilePath) {
        await this.deleteIfPresent(recording.encryptedFilePath);
      }
      if (recording.playbackFilePath) {
        await this.deleteIfPresent(recording.playbackFilePath);
      }
      if (recording.encryptedPlaybackFilePath) {
        await this.deleteIfPresent(recording.encryptedPlaybackFilePath);
      }
      await (this.prisma as any).callRecordings.update({
        where: { recordingId: recording.recordingId },
        data: {
          recordingStatus: 'DELETED_BY_RETENTION',
          failureReason: null,
        },
      });
    }
  }

  private async deleteIfPresent(filePath: string) {
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
