import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { LocalSpoolStore, SpoolRecord } from './local-spool.store';

const DEFAULT_STREAM_MAXLEN = 100_000;
const PENDING_SCAN_CAP = 10_000;

export type SpoolSource = 'REDIS' | 'LOCAL' | 'NONE';

export interface SpoolAppendResult {
  source: SpoolSource;
  idempotencyKey: string;
  redisStreamId?: string;
  localSpoolPath?: string;
  localOffset?: number;
}

/**
 * DB 저장 이전에 원본 이벤트를 내구 저장소에 먼저 남긴다.
 *
 * 중요 — `offlineSpoolEntries` 테이블은 내구 저장소가 **아니다.** 그 테이블은
 * PostgreSQL 에 있고, 이 서비스의 존재 이유는 PostgreSQL 이 죽은 구간이다.
 * 실제 내구 저장소는 Redis Streams 이고, Redis 까지 죽으면 로컬 JSONL 이다.
 *
 * 3단 폴백: Redis Streams → 로컬 JSONL → 포기(관측만).
 * 마지막 단계에서도 예외를 던지지 않는다. spool 실패로 AMI 수신 루프를 멈추면
 * 살아 있는 통화의 이벤트까지 잃는다.
 */
@Injectable()
export class DurableSpoolService {
  private readonly logger = new Logger(DurableSpoolService.name);
  private readonly streamMaxLen: number;

  constructor(
    private readonly redis: RedisService,
    private readonly local: LocalSpoolStore,
    private readonly config: ConfigService,
  ) {
    const raw = Number(
      this.config.get<string>('RESILIENCE_SPOOL_MAXLEN', String(DEFAULT_STREAM_MAXLEN)),
    );
    this.streamMaxLen = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STREAM_MAXLEN;
  }

  private streamKey(tenantId: string): string {
    return `kcti:spool:${tenantId}:ami`;
  }

  private cursorKey(tenantId: string): string {
    return `${this.streamKey(tenantId)}:cursor`;
  }

  async appendAmiEvent(
    normalized: Record<string, any>,
    idempotencyKey: string,
  ): Promise<SpoolAppendResult> {
    const tenantId = normalized.tenantId;
    if (!tenantId) {
      // linkedid 없는 이벤트와 마찬가지로 재구성할 수 없다. 조용히 버린다.
      return { source: 'NONE', idempotencyKey };
    }

    const record: SpoolRecord = {
      tenantId,
      entryType: 'AMI_EVENT',
      idempotencyKey,
      linkedid: normalized.linkedid ?? normalized.Linkedid ?? null,
      uniqueid: normalized.uniqueid ?? normalized.Uniqueid ?? null,
      receivedAt: new Date().toISOString(),
      payload: normalized,
    };

    try {
      const streamId = await this.redis
        .getClient()
        .xadd(
          this.streamKey(tenantId),
          'MAXLEN',
          '~',
          this.streamMaxLen,
          '*',
          'payload',
          JSON.stringify(record),
        );
      return { source: 'REDIS', idempotencyKey, redisStreamId: String(streamId) };
    } catch (err) {
      this.logger.warn(`redis spool failed, falling back to local: ${(err as Error).message}`);
    }

    try {
      const { path, offset } = await this.local.append(record);
      return { source: 'LOCAL', idempotencyKey, localSpoolPath: path, localOffset: offset };
    } catch (err) {
      this.logger.error(
        `local spool failed for tenant=${tenantId} key=${idempotencyKey}: ${(err as Error).message}`,
      );
      return { source: 'NONE', idempotencyKey };
    }
  }

  /**
   * 처리 완료 커서를 전진시킨다.
   *
   * DB row 를 갱신하지 않는 이유: 이 호출은 DB 가 죽어 있을 때도 일어날 수 있다.
   * 커서는 Redis 또는 로컬 파일에만 둔다.
   */
  async markProcessed(tenantId: string, appended: SpoolAppendResult): Promise<void> {
    try {
      if (appended.source === 'REDIS' && appended.redisStreamId) {
        await this.redis.getClient().set(this.cursorKey(tenantId), appended.redisStreamId);
        return;
      }
      if (appended.source === 'LOCAL' && typeof appended.localOffset === 'number') {
        await this.local.commitCursor(tenantId, appended.localOffset);
      }
    } catch (err) {
      // 커서 갱신 실패는 재처리 범위가 넓어질 뿐 유실이 아니다. replay 가 멱등하므로 안전하다.
      this.logger.warn(`spool cursor commit failed for tenant=${tenantId}: ${(err as Error).message}`);
    }
  }

  /** 미처리 이벤트 수. health/metric 에 노출한다. */
  async getPendingDepth(tenantId: string): Promise<number> {
    const localDepth = await this.local.pendingCount(tenantId).catch(() => 0);

    try {
      const client = this.redis.getClient();
      const cursor = await client.get(this.cursorKey(tenantId));
      const from = cursor ? `(${cursor}` : '-';
      const entries = await client.xrange(
        this.streamKey(tenantId),
        from,
        '+',
        'COUNT',
        PENDING_SCAN_CAP,
      );
      return (entries?.length ?? 0) + localDepth;
    } catch {
      // Redis 가 죽어 있으면 셀 수 있는 건 로컬 분뿐이다.
      return localDepth;
    }
  }

  /** 복구 재처리용. Redis 미처리분 + 로컬 미처리분을 receivedAt 순으로 합친다. */
  async readPending(tenantId: string): Promise<SpoolRecord[]> {
    const records: SpoolRecord[] = [];

    try {
      const client = this.redis.getClient();
      const cursor = await client.get(this.cursorKey(tenantId));
      const from = cursor ? `(${cursor}` : '-';
      const entries = await client.xrange(
        this.streamKey(tenantId),
        from,
        '+',
        'COUNT',
        PENDING_SCAN_CAP,
      );
      for (const [, fields] of entries ?? []) {
        const payloadIndex = (fields as string[]).indexOf('payload');
        if (payloadIndex < 0) continue;
        try {
          records.push(JSON.parse((fields as string[])[payloadIndex + 1]) as SpoolRecord);
        } catch {
          this.logger.warn(`skipping corrupt redis spool entry for tenant=${tenantId}`);
        }
      }
    } catch (err) {
      this.logger.warn(`redis spool read failed for tenant=${tenantId}: ${(err as Error).message}`);
    }

    const localPending = await this.local
      .readPending(tenantId)
      .catch(() => ({ records: [] as SpoolRecord[], nextOffset: 0 }));
    records.push(...localPending.records);

    return records.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  }
}
