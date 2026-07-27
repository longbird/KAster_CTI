import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AmiLeaderElectionService } from '../redis/ami-leader-election.service';
import { RecordingFinalizerService } from './recording-finalizer.service';

@Injectable()
export class RecordingReconcileService implements OnModuleInit {
  private readonly logger = new Logger(RecordingReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly finalizer: RecordingFinalizerService,
    private readonly leader: AmiLeaderElectionService,
  ) {}

  onModuleInit(): void {
    setInterval(() => this.sweep().catch((error) => this.logger.error(error.message)), 30000);
  }

  async sweep() {
    if (!this.leader.isLeader()) return;

    const rows = await (this.prisma as any).callRecordings.findMany({
      where: {
        recordingStatus: { in: ['PENDING', 'MISSING'] },
        session: { sessionStatus: 'ENDED' },
      },
      select: {
        tenantId: true,
        callId: true,
        linkedid: true,
        filePath: true,
      },
      take: 100,
    });

    for (const row of rows) {
      await this.finalizer.enqueueForRecording({
        tenantId: row.tenantId,
        callId: row.callId,
        linkedid: row.linkedid,
        recFile: row.filePath,
      });
    }
  }
}
