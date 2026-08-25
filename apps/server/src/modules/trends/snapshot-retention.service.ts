import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AmiLeaderElectionService } from '../redis/ami-leader-election.service';
import { rollUpSnapshots } from './snapshot-rollup';

const DAY_MS = 86_400_000;

/** 이 기간이 지난 1분 행은 5분으로 접는다. */
const RAW_RETENTION_DAYS = 90;
/** 이 기간이 지난 5분 행은 지운다. */
const ROLLED_RETENTION_DAYS = 365;

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** 한 번에 접는 행 수. 한 번에 다 읽으면 오래된 현장에서 메모리를 먹는다. */
const ROLLUP_BATCH = 20_000;

/**
 * 스냅샷 보존 — 오래된 1분 행을 5분으로 접고, 더 오래된 5분 행을 지운다.
 *
 * 장애 분석은 보통 며칠 안에 하고, 장기 비교는 분 단위 해상도가 필요 없다.
 * 그래서 최근 90일만 원본으로 두고 그 이전은 5분 평균으로 줄인다.
 */
@Injectable()
export class SnapshotRetentionService implements OnModuleInit {
  private readonly logger = new Logger(SnapshotRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leader: AmiLeaderElectionService,
  ) {}

  onModuleInit(): void {
    setInterval(
      () => this.sweep().catch((error) => this.logger.error(`snapshot retention failed: ${error.message}`)),
      SWEEP_INTERVAL_MS,
    );
  }

  async sweep(): Promise<void> {
    if (!this.leader.isLeader()) return;

    await this.rollUpRawRows();
    await this.dropExpiredRolledRows();
  }

  private async rollUpRawRows(): Promise<void> {
    const cutoff = new Date(Date.now() - RAW_RETENTION_DAYS * DAY_MS);

    const rawRows = await this.prisma.dashboardSnapshots.findMany({
      where: { resolution: 'PT1M', capturedAt: { lt: cutoff } },
      orderBy: { capturedAt: 'asc' },
      take: ROLLUP_BATCH,
    });
    if (rawRows.length === 0) return;

    const rolled = rollUpSnapshots(rawRows as any, 'PT5M');

    // 반드시 <b>쓰고 나서</b> 지운다. 먼저 지우면 sweep 이 중간에 죽었을 때
    // 그 구간이 통째로 사라진다. 순서가 바뀌면 복구할 원본이 없다.
    await this.prisma.dashboardSnapshots.createMany({
      data: rolled.map((row) => ({ ...row, snapshotId: undefined })) as any,
      skipDuplicates: true,
    });

    await this.prisma.dashboardSnapshots.deleteMany({
      where: {
        resolution: 'PT1M',
        capturedAt: { lte: rawRows[rawRows.length - 1].capturedAt },
      },
    });

    this.logger.log(`Rolled up ${rawRows.length} snapshot rows into ${rolled.length} PT5M rows`);
  }

  private async dropExpiredRolledRows(): Promise<void> {
    const cutoff = new Date(Date.now() - ROLLED_RETENTION_DAYS * DAY_MS);
    const { count } = await this.prisma.dashboardSnapshots.deleteMany({
      where: { resolution: 'PT5M', capturedAt: { lt: cutoff } },
    });
    if (count > 0) this.logger.log(`Dropped ${count} expired PT5M snapshot rows`);
  }
}
