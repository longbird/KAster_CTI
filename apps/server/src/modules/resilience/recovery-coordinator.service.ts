import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { SessionEngineService } from '../calls/session-engine.service';
import { AmiConnectionService } from '../ami/ami-connection.service';
import { AmiLeaderElectionService } from '../redis/ami-leader-election.service';
import { DurableSpoolService } from './durable-spool.service';
import { ConfigSnapshotService } from './config-snapshot.service';
import { OperatingModeService } from './operating-mode.service';
import { ReplayBatchRepository } from './replay-batch.repository';
import { SpoolRecord } from './local-spool.store';

const PBX_PROBE_TIMEOUT_MS = 8000;

export interface PbxProbe {
  reachable: boolean;
  channelCount: number;
  queueEventCount: number;
}

export interface RecoveryOutcome {
  skipped?: 'NOT_LEADER' | 'DB_UNAVAILABLE';
  batchId: string | null;
  total: number;
  success: number;
  failure: number;
  completed: boolean;
  pbxProbe: PbxProbe;
}

const NO_PROBE: PbxProbe = { reachable: false, channelCount: 0, queueEventCount: 0 };

/**
 * DB 가 살아난 뒤 상태를 재구성한다.
 *
 * 원칙: 과거 이벤트만으로 현재를 확정하지 않는다. 장애 구간에 통화가 이미 끝났을 수도
 * 있으므로, 재처리와 함께 PBX 의 현재 채널/큐 상태를 조회해 결과에 함께 남긴다.
 */
@Injectable()
export class RecoveryCoordinatorService {
  private readonly logger = new Logger(RecoveryCoordinatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly durableSpool: DurableSpoolService,
    private readonly batches: ReplayBatchRepository,
    private readonly configSnapshot: ConfigSnapshotService,
    private readonly operatingMode: OperatingModeService,
    private readonly sessionEngine: SessionEngineService,
    private readonly ami: AmiConnectionService,
    private readonly leader: AmiLeaderElectionService,
  ) {}

  /**
   * 스풀 레코드 한 건을 재처리한다.
   *
   * `{ replay: true }` 가 핵심이다. 이 플래그가 없으면 장애 중 선점된 Redis dedupe 키에
   * 걸려 즉시 무시되고, 재처리가 통째로 무의미해진다 (Task 0B).
   *
   * raw 중복 여부로 건너뛰지 않는 이유: raw 저장과 세션 상태 전이는 서로 다른 두 번의
   * 쓰기다. raw 만 들어가고 상태 전이가 실패한 이벤트가 존재할 수 있다.
   */
  async replayOne(record: SpoolRecord): Promise<'replayed' | 'failed'> {
    try {
      await this.sessionEngine.processNormalizedEvent(record.payload, { replay: true });
      return 'replayed';
    } catch (err) {
      // 한 건의 실패가 배치 전체를 멈추면 안 된다. 남은 이벤트가 더 중요할 수 있다.
      this.logger.warn(
        `replay failed key=${record.idempotencyKey} linkedid=${record.linkedid}: ${(err as Error).message}`,
      );
      return 'failed';
    }
  }

  async startRecovery(tenantId: string): Promise<RecoveryOutcome> {
    const empty = (skipped: RecoveryOutcome['skipped']): RecoveryOutcome => ({
      skipped,
      batchId: null,
      total: 0,
      success: 0,
      failure: 0,
      completed: false,
      pbxProbe: NO_PROBE,
    });

    if (!this.leader.isLeader()) {
      return empty('NOT_LEADER');
    }

    if (!(await this.isDbWritable())) {
      this.logger.warn('recovery deferred: DB is still unavailable');
      return empty('DB_UNAVAILABLE');
    }

    const batch = await this.batches.openBatch(tenantId, 'AMI_EVENT');
    await this.batches.writeAudit({
      tenantId,
      eventType: 'RECOVERY_STARTED',
      operatingMode: this.operatingMode.getMode(),
      message: '복구 재처리를 시작합니다.',
      replayBatchId: batch?.replayBatchId ?? null,
    });

    // PBX 현재 상태를 먼저 본다. 재처리 결과를 해석할 기준이 된다.
    const pbxProbe = await this.probePbxState();

    // 설정 출처를 갱신해 둔다 (LKG 로 부팅했는지 DB 에서 읽었는지).
    await this.configSnapshot.load(tenantId, 'pbx').catch(() => null);

    const pending = await this.durableSpool.readPending(tenantId).catch((err) => {
      this.logger.error(`spool read failed during recovery: ${(err as Error).message}`);
      return [] as SpoolRecord[];
    });

    let success = 0;
    let failure = 0;
    const seen = new Set<string>();

    for (const record of pending) {
      // 모든 노드가 스풀하므로 노드 수만큼 중복이 있다. idempotencyKey 로 제거한다.
      if (record.idempotencyKey && seen.has(record.idempotencyKey)) continue;
      if (record.idempotencyKey) seen.add(record.idempotencyKey);

      const outcome = await this.replayOne(record);
      if (outcome === 'replayed') success += 1;
      else failure += 1;
    }

    const total = success + failure;
    if (batch) {
      await this.batches.recordProgress(batch.replayBatchId, { total, success, failure }, {
        lastIdempotencyKey: pending[pending.length - 1]?.idempotencyKey ?? null,
      });
      await this.batches.closeBatch(batch.replayBatchId, failure === 0 ? 'COMPLETED' : 'FAILED');
    }

    const completed = failure === 0;
    if (completed) {
      // 실패가 남아 있으면 NORMAL 로 돌리지 않는다. 미반영 이벤트를 안고 평시로
      // 복귀하면 그 뒤의 상태 불일치를 아무도 설명할 수 없게 된다.
      this.operatingMode.markRecoveryComplete();
    }

    await this.batches.writeAudit({
      tenantId,
      eventType: 'RECOVERY_FINISHED',
      operatingMode: this.operatingMode.getMode(),
      message: completed
        ? `복구 재처리를 완료했습니다. (${success}건)`
        : `복구 재처리에 실패가 있습니다. (성공 ${success} / 실패 ${failure})`,
      details: { total, success, failure, pbxProbe },
      replayBatchId: batch?.replayBatchId ?? null,
    });

    return {
      batchId: batch?.replayBatchId ?? null,
      total,
      success,
      failure,
      completed,
      pbxProbe,
    };
  }

  private async isDbWritable(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * PBX 의 현재 채널/큐 상태를 조회한다.
   * 실패해도 재처리는 계속한다 — AMI 가 잠깐 안 붙는 것과 이벤트 유실은 별개 문제다.
   */
  private async probePbxState(): Promise<PbxProbe> {
    try {
      const [channels, queues] = await Promise.all([
        this.ami.sendActionWithResponse(
          { Action: 'CoreShowChannels' },
          { eventList: true, timeoutMs: PBX_PROBE_TIMEOUT_MS },
        ),
        this.ami.sendActionWithResponse(
          { Action: 'QueueStatus' },
          { eventList: true, timeoutMs: PBX_PROBE_TIMEOUT_MS },
        ),
      ]);
      return {
        reachable: true,
        channelCount: channels?.length ?? 0,
        queueEventCount: queues?.length ?? 0,
      };
    } catch (err) {
      this.logger.warn(`PBX state probe failed: ${(err as Error).message}`);
      return NO_PROBE;
    }
  }
}
