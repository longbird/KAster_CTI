import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { PrismaService } from '../../common/prisma.service';
import { DurableSpoolService } from './durable-spool.service';
import { ConfigSnapshotService } from './config-snapshot.service';
import { OperatingModeService } from './operating-mode.service';
import { DataFreshness, OperatingMode, OperatingRestrictions } from './operating-mode.types';

export interface ResilienceMetrics {
  lkgVersion: string | null;
  lkgAgeSeconds: number | null;
  offlineEventQueueDepth: number;
  /** 명령 스풀은 아직 구현되지 않았다. 0 으로 보고하면 "밀린 명령 없음" 으로 오독된다. */
  offlineCommandQueueDepth: number | null;
  configVersionMismatch: number;
  dbRole: 'primary' | 'standby' | 'unknown';
  replicationLagSeconds: number | null;
  walArchiveAgeSeconds: number | null;
  backupLastSuccessTimestamp: string | null;
}

export interface ResilienceSummary {
  operatingMode: OperatingMode;
  dataFreshness: DataFreshness;
  restrictions: OperatingRestrictions;
  resilience: ResilienceMetrics;
}

const EMPTY_METRICS: ResilienceMetrics = {
  lkgVersion: null,
  lkgAgeSeconds: null,
  offlineEventQueueDepth: 0,
  offlineCommandQueueDepth: null,
  configVersionMismatch: 0,
  dbRole: 'unknown',
  replicationLagSeconds: null,
  walArchiveAgeSeconds: null,
  backupLastSuccessTimestamp: null,
};

/**
 * /health 와 Prometheus 에 노출할 장애 대응 지표를 모은다.
 *
 * 모든 수집은 실패해도 예외를 던지지 않는다. 헬스 엔드포인트가 장애 때문에 500 을
 * 내면 정작 장애를 진단할 수단이 사라진다.
 */
@Injectable()
export class ResilienceHealthService {
  private readonly logger = new Logger(ResilienceHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly durableSpool: DurableSpoolService,
    private readonly configSnapshot: ConfigSnapshotService,
    private readonly operatingMode: OperatingModeService,
    private readonly config: ConfigService,
  ) {}

  async getSummary(tenantId?: string): Promise<ResilienceSummary> {
    const snapshot = this.operatingMode.snapshot();
    const [postgres, lkg, depth, mismatch, backupAt] = await Promise.all([
      this.probePostgres(),
      this.probeLkg(tenantId),
      this.probeSpoolDepth(tenantId),
      this.probeConfigMismatch(tenantId),
      this.probeBackupTimestamp(),
    ]);

    return {
      operatingMode: snapshot.mode,
      dataFreshness: snapshot.dataFreshness,
      restrictions: snapshot.restrictions,
      resilience: {
        ...EMPTY_METRICS,
        ...postgres,
        ...lkg,
        offlineEventQueueDepth: depth,
        configVersionMismatch: mismatch,
        backupLastSuccessTimestamp: backupAt,
      },
    };
  }

  private async probePostgres(): Promise<Partial<ResilienceMetrics>> {
    try {
      const roleRows = await this.prisma.$queryRaw<Array<{ isStandby: boolean }>>`
        SELECT pg_is_in_recovery() AS "isStandby"
      `;
      const isStandby = Boolean(roleRows?.[0]?.isStandby);

      // 복제 지연은 standby 에서만 의미가 있다. primary 에서는 항상 null.
      const lagRows = await this.prisma.$queryRaw<Array<{ lagSeconds: number | null }>>`
        SELECT CASE
          WHEN pg_is_in_recovery()
          THEN EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))
          ELSE NULL
        END AS "lagSeconds"
      `;

      const walRows = await this.prisma.$queryRaw<Array<{ ageSeconds: number | null }>>`
        SELECT EXTRACT(EPOCH FROM (now() - last_archived_time)) AS "ageSeconds"
        FROM pg_stat_archiver
      `;

      return {
        dbRole: isStandby ? 'standby' : 'primary',
        replicationLagSeconds: toNumberOrNull(lagRows?.[0]?.lagSeconds),
        walArchiveAgeSeconds: toNumberOrNull(walRows?.[0]?.ageSeconds),
      };
    } catch (err) {
      this.logger.debug(`postgres resilience probe failed: ${(err as Error).message}`);
      return { dbRole: 'unknown', replicationLagSeconds: null, walArchiveAgeSeconds: null };
    }
  }

  private async probeLkg(tenantId?: string): Promise<Partial<ResilienceMetrics>> {
    if (!tenantId) return {};
    try {
      const snapshot = await this.configSnapshot.load(tenantId, 'pbx');
      const age = await this.configSnapshot.getLkgAgeSeconds(tenantId, 'pbx');
      return {
        lkgVersion: snapshot ? String(snapshot.version) : null,
        lkgAgeSeconds: age,
      };
    } catch {
      return {};
    }
  }

  private async probeSpoolDepth(tenantId?: string): Promise<number> {
    if (!tenantId) return 0;
    return this.durableSpool.getPendingDepth(tenantId).catch(() => 0);
  }

  private async probeConfigMismatch(tenantId?: string): Promise<number> {
    if (!tenantId) return 0;
    try {
      return await (this.prisma as any).configApplyStatus.count({
        where: { tenantId, status: { not: 'APPLIED' } },
      });
    } catch {
      return 0;
    }
  }

  /**
   * pgBackRest 결과는 PostgreSQL 이 알지 못한다. 백업 잡이 성공 시각을 파일에 남기고
   * (Task 8 runbook 참고) 여기서 읽는다. 파일이 없으면 null — 0 이나 현재 시각으로
   * 채우면 "백업 정상" 으로 오독된다.
   */
  private async probeBackupTimestamp(): Promise<string | null> {
    const path = this.config.get<string>('RESILIENCE_BACKUP_STATUS_FILE', '');
    if (!path) return null;
    try {
      const raw = (await fs.readFile(path, 'utf8')).trim();
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    } catch {
      return null;
    }
  }
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
