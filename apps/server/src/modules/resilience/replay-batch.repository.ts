import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export interface ReplayBatch {
  replayBatchId: string;
  tenantId: string;
  replayType: string;
  status: string;
  totalCount: number;
  successCount: number;
  failureCount: number;
  cursor: Record<string, unknown>;
}

/**
 * replayBatches 접근을 한곳에 모은다.
 *
 * 코디네이터가 Prisma 를 직접 만지지 않게 하는 이유는 테스트가 아니라 복구 순서 때문이다.
 * 배치 기록은 DB 가 살아난 뒤에만 가능하고, 재처리 자체는 DB 없이도 진행될 수 있어야
 * 하므로 두 관심사를 섞으면 실패 경로가 엉킨다.
 */
@Injectable()
export class ReplayBatchRepository {
  private readonly logger = new Logger(ReplayBatchRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 중단된 배치가 있으면 이어서 쓰고, 없으면 새로 만든다. */
  async openBatch(tenantId: string, replayType: string): Promise<ReplayBatch | null> {
    try {
      const existing = await (this.prisma as any).replayBatches.findFirst({
        where: { tenantId, replayType, status: { in: ['PENDING', 'RUNNING'] } },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        this.logger.log(`resuming replay batch ${existing.replayBatchId}`);
        return this.toBatch(existing);
      }

      const created = await (this.prisma as any).replayBatches.create({
        data: { tenantId, replayType, status: 'RUNNING', startedAt: new Date() },
      });
      return this.toBatch(created);
    } catch (err) {
      // 배치 기록 없이도 재처리는 진행한다. 추적성만 잃는다.
      this.logger.warn(`replay batch open failed: ${(err as Error).message}`);
      return null;
    }
  }

  async recordProgress(
    batchId: string,
    counts: { total: number; success: number; failure: number },
    cursor: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await (this.prisma as any).replayBatches.update({
        where: { replayBatchId: batchId },
        data: {
          totalCount: counts.total,
          successCount: counts.success,
          failureCount: counts.failure,
          cursor: cursor as any,
          updatedAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn(`replay batch progress failed: ${(err as Error).message}`);
    }
  }

  async closeBatch(batchId: string, status: 'COMPLETED' | 'FAILED'): Promise<void> {
    try {
      await (this.prisma as any).replayBatches.update({
        where: { replayBatchId: batchId },
        data: { status, finishedAt: new Date(), updatedAt: new Date() },
      });
    } catch (err) {
      this.logger.warn(`replay batch close failed: ${(err as Error).message}`);
    }
  }

  async writeAudit(entry: {
    tenantId: string;
    eventType: string;
    operatingMode: string;
    message: string;
    details?: Record<string, unknown>;
    replayBatchId?: string | null;
  }): Promise<void> {
    try {
      await (this.prisma as any).recoveryAuditLog.create({
        data: {
          tenantId: entry.tenantId,
          eventType: entry.eventType,
          operatingMode: entry.operatingMode,
          message: entry.message,
          details: (entry.details ?? {}) as any,
          replayBatchId: entry.replayBatchId ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(`recovery audit write failed: ${(err as Error).message}`);
    }
  }

  private toBatch(row: any): ReplayBatch {
    return {
      replayBatchId: row.replayBatchId,
      tenantId: row.tenantId,
      replayType: row.replayType,
      status: row.status,
      totalCount: row.totalCount ?? 0,
      successCount: row.successCount ?? 0,
      failureCount: row.failureCount ?? 0,
      cursor: (row.cursor ?? {}) as Record<string, unknown>,
    };
  }
}
