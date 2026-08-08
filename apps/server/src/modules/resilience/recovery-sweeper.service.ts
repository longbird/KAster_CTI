import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AmiLeaderElectionService } from '../redis/ami-leader-election.service';
import { LocalSpoolStore } from './local-spool.store';
import { DurableSpoolService } from './durable-spool.service';
import { OperatingModeService } from './operating-mode.service';
import { RecoveryCoordinatorService } from './recovery-coordinator.service';

const SWEEP_INTERVAL_MS = 15_000;

/**
 * RECOVERING 상태를 실제로 끝내는 주체.
 *
 * 이게 없으면 Recovery Coordinator 는 아무도 부르지 않는 죽은 코드가 되고, DB 가 한 번
 * 끊기는 순간 시스템은 RECOVERING 에 영구히 갇힌다 (= 설정 저장이 영원히 막힌다).
 * 자동 복귀 경로를 사람 손에 맡기면 안 된다.
 *
 * 주기 sweep + 리더 가드는 이 레포의 기존 패턴(OutboxPublisher, SessionRecoverySweeper,
 * RecordingFinalizer)과 같다. 재시도가 공짜라 일시적 실패에 강하다.
 */
@Injectable()
export class RecoverySweeperService implements OnModuleInit {
  private readonly logger = new Logger(RecoverySweeperService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly localSpool: LocalSpoolStore,
    private readonly durableSpool: DurableSpoolService,
    private readonly operatingMode: OperatingModeService,
    private readonly coordinator: RecoveryCoordinatorService,
    private readonly leader: AmiLeaderElectionService,
  ) {}

  onModuleInit(): void {
    setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
  }

  async sweep(): Promise<void> {
    if (this.operatingMode.getMode() !== 'RECOVERING') return;
    if (!this.leader.isLeader()) return;

    // 재처리는 길어질 수 있다. 겹쳐 돌면 같은 스풀을 두 번 읽는다.
    if (this.running) return;
    this.running = true;

    try {
      for (const tenantId of await this.resolveTenants()) {
        try {
          const outcome = await this.coordinator.startRecovery(tenantId);
          if (outcome?.failure) {
            this.logger.warn(
              `recovery for tenant=${tenantId} left ${outcome.failure} failed events; will retry`,
            );
            continue;
          }
          // 전부 처리된 스풀만 비운다. append-only 파일을 그대로 두면 장애가 반복될수록
          // 디스크가 찬다. compact 는 미처리분이 남아 있으면 스스로 아무것도 하지 않는다.
          await this.localSpool.compact(tenantId).catch((err) => {
            this.logger.warn(`spool compact failed for tenant=${tenantId}: ${err.message}`);
          });
          // Redis 쪽도 같이 배수한다. 리더 전환 경계에서 다른 노드의 append 가 커서 뒤에
          // 남으면 offline depth 가 영원히 0 이 되지 않는다 (로컬 compact 와 대칭).
          await this.durableSpool.drainCursor(tenantId).catch((err) => {
            this.logger.warn(`spool cursor drain failed for tenant=${tenantId}: ${err.message}`);
          });
        } catch (err) {
          // 한 테넌트의 실패가 나머지를 막지 않는다.
          this.logger.error(`recovery sweep failed for tenant=${tenantId}: ${(err as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * DB 의 활성 테넌트 + 로컬 스풀에 파일이 남은 테넌트.
   *
   * 로컬 스풀 쪽을 반드시 합치는 이유: DB 를 아직 못 읽는 상황에서도 재처리 대상은
   * 존재한다. DB 목록만 보면 정작 복구가 필요한 테넌트를 놓친다.
   */
  private async resolveTenants(): Promise<string[]> {
    const tenants = new Set<string>();

    try {
      const rows = await this.prisma.tenants.findMany({
        where: { isActive: true },
        select: { tenantId: true },
      });
      for (const row of rows) tenants.add(row.tenantId);
    } catch (err) {
      this.logger.warn(`tenant lookup failed during recovery sweep: ${(err as Error).message}`);
    }

    try {
      for (const tenantId of await this.localSpool.listTenants()) tenants.add(tenantId);
    } catch {
      // 스풀 디렉터리가 없으면 대상도 없다.
    }

    return [...tenants];
  }
}
