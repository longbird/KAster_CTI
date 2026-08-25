import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { SnapshotResolution } from './snapshot-rollup';
import {
  CallBucket,
  SnapshotBucket,
  TrendPoint,
  countBuckets,
  mergeTrendPoints,
} from './trend-series';
import { ListTrendsQueryDto } from './dto/list-trends.query.dto';

/**
 * 한 응답이 그릴 수 있는 점의 상한.
 *
 * 넘으면 더 굵은 해상도를 쓰라고 거절한다. 조용히 잘라 보내면 화면은 구간이
 * 끝난 줄 알고 그린다 — 없는 데이터가 아니라 <b>안 보낸 데이터</b>인데 구분이 안 된다.
 */
const MAX_POINTS = 3000;

/** Postgres `date_trunc` 단위. 5분은 trunc 로 안 되므로 따로 계산한다. */
const TRUNC_UNIT: Record<SnapshotResolution, string> = {
  PT1M: 'minute',
  PT5M: 'minute',
  PT1H: 'hour',
  P1D: 'day',
};

@Injectable()
export class TrendQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async query(tenantId: string, query: ListTrendsQueryDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      throw new BadRequestException('from/to 가 유효하지 않습니다.');
    }

    const resolution = query.resolution ?? this.pickResolution(from, to);
    const points = countBuckets(from, to, resolution);
    if (points > MAX_POINTS) {
      throw new BadRequestException(
        `요청 구간이 ${resolution} 해상도로 ${points}개 구간입니다 (최대 ${MAX_POINTS}). 더 굵은 해상도를 쓰거나 기간을 줄이십시오.`,
      );
    }

    const queueId = await this.resolveQueueId(tenantId, query.queueId);
    const queueName = queueId ? await this.readQueueName(tenantId, queueId) : null;

    const [calls, snapshots] = await Promise.all([
      this.readCallBuckets(tenantId, from, to, resolution, queueName),
      this.readSnapshotBuckets(tenantId, from, to, queueId),
    ]);

    return {
      range: { from, to, resolution, queueId },
      points: mergeTrendPoints({ from, to, resolution, calls, snapshots }) as TrendPoint[],
    };
  }

  /** 구간이 길수록 굵게. 상한(MAX_POINTS)을 넘지 않는 가장 세밀한 해상도를 고른다. */
  private pickResolution(from: Date, to: Date): SnapshotResolution {
    const candidates: SnapshotResolution[] = ['PT1M', 'PT5M', 'PT1H', 'P1D'];
    return candidates.find((candidate) => countBuckets(from, to, candidate) <= MAX_POINTS) ?? 'P1D';
  }

  private async resolveQueueId(tenantId: string, queueId?: string): Promise<string | null> {
    if (!queueId) return null;
    const queue = await this.prisma.queues.findFirst({
      where: { tenantId, queueId },
      select: { queueId: true },
    });
    // 테넌트 밖의 큐를 물어보면 빈 그래프가 아니라 오류를 준다. 빈 그래프는
    // "그 시간에 통화가 없었다"로 읽혀서 잘못된 결론을 만든다.
    if (!queue) throw new BadRequestException('큐를 찾을 수 없습니다.');
    return queue.queueId;
  }

  private async readQueueName(tenantId: string, queueId: string): Promise<string | null> {
    const queue = await this.prisma.queues.findFirst({
      where: { tenantId, queueId },
      select: { queueName: true },
    });
    return queue?.queueName ?? null;
  }

  /**
   * 통화 축. `callSessions` 에서 요청 시점에 집계한다.
   *
   * 스냅샷과 달리 적재가 필요 없다 — 이벤트가 이미 남아 있어서 <b>적재를 시작하기
   * 전 기간도 소급 조회된다.</b>
   */
  private async readCallBuckets(
    tenantId: string,
    from: Date,
    to: Date,
    resolution: SnapshotResolution,
    queueName: string | null,
  ): Promise<CallBucket[]> {
    const bucketExpr = this.bucketExpression(resolution);
    const queueFilter = queueName
      ? Prisma.sql`AND s."queueName" = ${queueName}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<Array<{
      bucketStart: Date;
      inbound: bigint | number;
      answered: bigint | number;
      abandoned: bigint | number;
      avgWaitSeconds: number | null;
      avgTalkSeconds: number | null;
    }>>`
      SELECT
        ${bucketExpr} AS "bucketStart",
        COUNT(*)                                             AS "inbound",
        COUNT(*) FILTER (WHERE s."answeredAt" IS NOT NULL)   AS "answered",
        COUNT(*) FILTER (WHERE s."abandonFlag")              AS "abandoned",
        AVG(EXTRACT(EPOCH FROM (s."answeredAt" - s."queuedAt")))
          FILTER (WHERE s."answeredAt" IS NOT NULL AND s."queuedAt" IS NOT NULL) AS "avgWaitSeconds",
        AVG(s."talkSeconds") FILTER (WHERE s."talkSeconds" > 0)                  AS "avgTalkSeconds"
      FROM "callSessions" s
      WHERE s."tenantId" = ${tenantId}::uuid
        AND s."startedAt" >= ${from}
        AND s."startedAt" <  ${to}
        ${queueFilter}
      GROUP BY 1
      ORDER BY 1
    `;

    return rows.map((row) => ({
      at: row.bucketStart,
      inbound: Number(row.inbound),
      answered: Number(row.answered),
      abandoned: Number(row.abandoned),
      avgWaitSeconds: Math.round(Number(row.avgWaitSeconds ?? 0)),
      avgTalkSeconds: Math.round(Number(row.avgTalkSeconds ?? 0)),
    }));
  }

  /**
   * 5분은 `date_trunc` 로 안 되므로 분으로 내린 뒤 5분 배수로 다시 내린다.
   * 나머지 해상도는 `date_trunc` 하나로 끝난다.
   */
  private bucketExpression(resolution: SnapshotResolution): Prisma.Sql {
    const unit = TRUNC_UNIT[resolution];
    if (resolution !== 'PT5M') {
      return Prisma.sql`date_trunc(${unit}, s."startedAt")`;
    }
    return Prisma.sql`
      date_trunc('hour', s."startedAt")
        + make_interval(mins => (EXTRACT(MINUTE FROM s."startedAt")::int / 5) * 5)
    `;
  }

  /**
   * 리소스 축. 저장된 해상도(PT1M/PT5M)를 그대로 읽고, 요청 해상도로 접는 것은
   * `mergeTrendPoints` 가 한다 — 접는 규칙(평균/최대)이 한 곳에만 있어야 한다.
   */
  private readSnapshotBuckets(
    tenantId: string,
    from: Date,
    to: Date,
    queueId: string | null,
  ): Promise<SnapshotBucket[]> {
    return this.prisma.dashboardSnapshots.findMany({
      where: {
        tenantId,
        queueId,
        capturedAt: { gte: from, lt: to },
      },
      orderBy: { capturedAt: 'asc' },
    }).then((rows: any[]) => rows.map((row) => ({ ...row, at: row.capturedAt })));
  }
}
