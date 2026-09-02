import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeatureEntitlementService } from '../../common/feature-entitlement.service';
import { PrismaService } from '../../common/prisma.service';
import { AmiLeaderElectionService } from '../redis/ami-leader-election.service';
import { CallAnalysisSweeperService } from './call-analysis-sweeper.service';

const DEFAULT_RECONCILE_MS = 30000;
const DEFAULT_LOOKBACK_HOURS = 24;
const DEFAULT_MAX_PER_SWEEP = 50;

/**
 * 확정된 녹취 중 분석 job 이 없는 건을 찾아 적재한다.
 *
 * 녹취 확정 서비스가 직접 job 을 넣지 않는 이유는 두 가지다.
 * 1. `recording-pipeline` 을 건드리지 않는다 — 검증된 확정 경로를 그대로 둔다.
 * 2. 모듈 의존 방향을 한쪽으로 유지한다 (call-analysis → recording-pipeline).
 * 분석을 나중에 켠 사이트도 되돌아보는 기간 안의 녹취는 자동으로 따라잡는다.
 */
@Injectable()
export class CallAnalysisReconcileService implements OnModuleInit {
  private readonly logger = new Logger(CallAnalysisReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sweeper: CallAnalysisSweeperService,
    private readonly entitlement: FeatureEntitlementService,
    private readonly leader?: AmiLeaderElectionService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) return;

    const intervalMs = this.numberFromEnv('CALL_ANALYSIS_RECONCILE_MS', DEFAULT_RECONCILE_MS);
    setInterval(() => this.sweep().catch((error) => this.logger.error(error.message)), intervalMs);
  }

  async sweep(): Promise<void> {
    if (!this.isEnabled()) return;
    if (this.leader && !this.leader.isLeader()) return;

    const lookbackHours = this.numberFromEnv('CALL_ANALYSIS_LOOKBACK_HOURS', DEFAULT_LOOKBACK_HOURS);
    const recordings = await (this.prisma as any).callRecordings.findMany({
      where: {
        recordingStatus: 'READY',
        finalizedAt: { gte: new Date(Date.now() - lookbackHours * 3600_000) },
        analysisJobs: { none: {} },
      },
      select: { recordingId: true, tenantId: true, callId: true },
      orderBy: { finalizedAt: 'asc' },
      take: this.numberFromEnv('CALL_ANALYSIS_MAX_ENQUEUE_PER_SWEEP', DEFAULT_MAX_PER_SWEEP),
    });

    for (const recording of recordings) {
      try {
        // 자격이 없는 테넌트는 적재하지 않는다. 이미 쌓인 job 은 sweeper 가 마저 처리한다 —
        // 처리 중인 통화를 어중간하게 남기지 않는다.
        if (!(await this.entitlement.isEnabled(recording.tenantId, 'call-analysis'))) continue;

        await this.sweeper.enqueue({
          tenantId: recording.tenantId,
          callId: recording.callId,
          recordingId: recording.recordingId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`failed to enqueue analysis for recording=${recording.recordingId}: ${message}`);
      }
    }
  }

  private isEnabled(): boolean {
    return this.config.get<string>('CALL_ANALYSIS_ENABLED', 'false') === 'true';
  }

  private numberFromEnv(key: string, fallback: number): number {
    const parsed = Number.parseInt(this.config.get<string>(key, String(fallback)) ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
