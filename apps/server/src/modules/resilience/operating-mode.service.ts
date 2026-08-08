import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConfigSource,
  DataFreshness,
  OperatingMode,
  OperatingModeSnapshot,
  RESTRICTIONS_BY_MODE,
} from './operating-mode.types';

const DEFAULT_DEGRADED_AFTER_MS = 30_000;

/**
 * 운영 모드의 단일 진실원. 순수 상태 기계이며 I/O 를 하지 않는다.
 *
 * 시각은 전부 호출자가 넘긴다 (`now`). 타이머를 내장하면 테스트가 실시간에 묶이고,
 * 장애 시각은 어차피 이벤트를 관측한 쪽이 알고 있다.
 */
@Injectable()
export class OperatingModeService {
  private readonly logger = new Logger(OperatingModeService.name);
  private readonly degradedAfterMs: number;

  private mode: OperatingMode = 'NORMAL';
  private since = new Date();
  private outageStartedAt: Date | null = null;
  private lastDbFailureAt: Date | null = null;
  private lastDbRecoveredAt: Date | null = null;
  private configSource: ConfigSource = 'fresh';

  constructor(private readonly config: ConfigService) {
    const raw = Number(
      this.config.get<string>('RESILIENCE_DEGRADED_AFTER_MS', String(DEFAULT_DEGRADED_AFTER_MS)),
    );
    this.degradedAfterMs = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_DEGRADED_AFTER_MS;
  }

  /**
   * DB 접근 실패를 관측했을 때 호출한다.
   * 최초 실패로부터 degradedAfterMs 가 지나면 DEGRADED 로 내린다.
   */
  recordDbFailure(now: Date = new Date()): void {
    this.lastDbFailureAt = now;

    // RECOVERING 중 재실패는 이어지는 장애가 아니라 새 장애다.
    // 임계 시간을 최초 장애부터 세면 즉시 DEGRADED 로 떨어져 과잉 제한이 된다.
    if (this.mode === 'NORMAL' || this.mode === 'RECOVERING') {
      this.outageStartedAt = now;
      this.transition('DB_FAILOVER', now);
      return;
    }

    if (this.mode === 'DB_FAILOVER') {
      const startedAt = this.outageStartedAt ?? now;
      if (now.getTime() - startedAt.getTime() >= this.degradedAfterMs) {
        this.transition('DEGRADED', now);
      }
    }
  }

  /** DB 접근이 다시 성공했을 때 호출한다. 재처리가 남았으므로 곧장 NORMAL 로 가지 않는다. */
  recordDbRecovered(now: Date = new Date()): void {
    if (this.mode !== 'DB_FAILOVER' && this.mode !== 'DEGRADED') {
      return;
    }
    this.lastDbRecoveredAt = now;
    this.transition('RECOVERING', now);
  }

  /** Recovery Coordinator 가 replay 를 모두 끝냈을 때 호출한다. */
  markRecoveryComplete(now: Date = new Date()): void {
    if (this.mode !== 'RECOVERING') {
      return;
    }
    this.outageStartedAt = null;
    this.transition('NORMAL', now);
  }

  /** ConfigSnapshotService 가 설정을 어디서 읽었는지 보고한다. */
  reportConfigSource(source: ConfigSource): void {
    this.configSource = source;
  }

  isRestricted(): boolean {
    return this.mode !== 'NORMAL';
  }

  getMode(): OperatingMode {
    return this.mode;
  }

  snapshot(): OperatingModeSnapshot {
    return {
      mode: this.mode,
      since: this.since.toISOString(),
      lastDbFailureAt: this.lastDbFailureAt?.toISOString() ?? null,
      lastDbRecoveredAt: this.lastDbRecoveredAt?.toISOString() ?? null,
      dataFreshness: this.buildFreshness(),
      restrictions: RESTRICTIONS_BY_MODE[this.mode],
    };
  }

  private buildFreshness(): DataFreshness {
    const db: DataFreshness['db'] =
      this.mode === 'NORMAL' ? 'fresh' : this.mode === 'RECOVERING' ? 'stale' : 'unavailable';

    return {
      db,
      config: this.configSource,
      // 고객 조회는 DB 를 못 쓰는 동안 캐시로만 답한다.
      customer: db === 'unavailable' ? 'cache-only' : 'fresh',
    };
  }

  private transition(next: OperatingMode, now: Date): void {
    if (this.mode === next) return;
    this.logger.warn(`operating mode ${this.mode} -> ${next}`);
    this.mode = next;
    this.since = now;
  }
}
