import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma.service';
import { buildStartedAtBucketExpression } from '../call-bucket-expression';
import { SnapshotResolution } from '../snapshot-rollup';
import { countBuckets } from '../trend-series';
import {
  KeywordCount,
  RisingKeyword,
  SentimentPoint,
  computeRisingKeywords,
  fillSentimentSeries,
} from './insight-series.util';

/** 추이 조회와 같은 상한. 넘으면 조용히 자르지 않고 더 굵은 해상도를 쓰라고 거절한다. */
const MAX_POINTS = 3000;
const RISING_KEYWORD_LIMIT = 10;
const RISING_KEYWORD_MIN_CALLS = 3;

export interface CallInsightsQuery {
  from: string;
  to: string;
  resolution?: SnapshotResolution;
  queueId?: string;
}

export interface CategoryInsight {
  categoryId: string | null;
  code: string | null;
  name: string | null;
  calls: number;
  avgTalkSeconds: number;
  negativeCalls: number;
}

export interface CallInsightsResult {
  range: { from: Date; to: Date; resolution: SnapshotResolution; queueId: string | null };
  totals: { totalCalls: number; analyzedCalls: number };
  sentimentSeries: SentimentPoint[];
  categories: CategoryInsight[];
  risingKeywords: RisingKeyword[];
}

/**
 * 통화 AI 분석 인사이트.
 *
 * 스냅샷에 적재하지 않고 **요청 시점에 집계**한다. 분석 결과는 통화가 끝나고 수 분 뒤에
 * 도착하므로, 통화 시각 기준 스냅샷에 넣으면 늦게 도착한 분석이 영원히 빠진다.
 * 추이 화면의 통화 축(`TrendQueryService.readCallBuckets`)과 같은 이유·같은 방식이다.
 */
@Injectable()
export class CallInsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async query(tenantId: string, query: CallInsightsQuery): Promise<CallInsightsResult> {
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

    const queue = await this.resolveQueue(tenantId, query.queueId);
    const queueFilter = queue?.queueName
      ? Prisma.sql`AND s."queueName" = ${queue.queueName}`
      : Prisma.empty;

    // 급상승은 "직전 같은 길이 구간" 과 비교한다. 하루를 보면 그 전날과 비교된다.
    const windowMs = to.getTime() - from.getTime();
    const previousFrom = new Date(from.getTime() - windowMs);

    const [sentimentRows, categoryRows, currentKeywords, previousKeywords, coverage] =
      await Promise.all([
        this.readSentimentBuckets(tenantId, from, to, resolution, queueFilter),
        this.readCategories(tenantId, from, to, queueFilter),
        this.readKeywordCounts(tenantId, from, to, queueFilter),
        this.readKeywordCounts(tenantId, previousFrom, from, queueFilter),
        this.readCoverage(tenantId, from, to, queueFilter),
      ]);

    return {
      range: { from, to, resolution, queueId: queue?.queueId ?? null },
      totals: coverage,
      sentimentSeries: fillSentimentSeries(from, to, resolution, sentimentRows),
      categories: categoryRows,
      risingKeywords: computeRisingKeywords(currentKeywords, previousKeywords, {
        limit: RISING_KEYWORD_LIMIT,
        minCalls: RISING_KEYWORD_MIN_CALLS,
      }),
    };
  }

  private pickResolution(from: Date, to: Date): SnapshotResolution {
    const candidates: SnapshotResolution[] = ['PT1M', 'PT5M', 'PT1H', 'P1D'];
    return candidates.find((candidate) => countBuckets(from, to, candidate) <= MAX_POINTS) ?? 'P1D';
  }

  private async resolveQueue(tenantId: string, queueId?: string) {
    if (!queueId) return null;

    const queue = await this.prisma.queues.findFirst({
      where: { tenantId, queueId },
      select: { queueId: true, queueName: true },
    });
    // 빈 그래프는 "그 기간에 분석된 통화가 없었다"로 읽힌다. 잘못된 큐는 오류로 끊는다.
    if (!queue) throw new BadRequestException('큐를 찾을 수 없습니다.');
    return queue;
  }

  private async readSentimentBuckets(
    tenantId: string,
    from: Date,
    to: Date,
    resolution: SnapshotResolution,
    queueFilter: Prisma.Sql,
  ) {
    const bucketExpr = buildStartedAtBucketExpression(resolution);
    const rows = await this.prisma.$queryRaw<Array<{
      bucketStart: Date;
      positive: bigint | number;
      neutral: bigint | number;
      negative: bigint | number;
    }>>`
      SELECT
        ${bucketExpr} AS "bucketStart",
        COUNT(*) FILTER (WHERE a."sentiment" = 'POSITIVE') AS "positive",
        COUNT(*) FILTER (WHERE a."sentiment" = 'NEUTRAL')  AS "neutral",
        COUNT(*) FILTER (WHERE a."sentiment" = 'NEGATIVE') AS "negative"
      FROM "callAnalyses" a
      JOIN "callSessions" s ON s."callId" = a."callId"
      WHERE a."tenantId" = ${tenantId}::uuid
        AND s."startedAt" >= ${from}
        AND s."startedAt" <  ${to}
        ${queueFilter}
      GROUP BY 1
      ORDER BY 1
    `;

    return rows.map((row) => ({
      at: row.bucketStart,
      positive: Number(row.positive),
      neutral: Number(row.neutral),
      negative: Number(row.negative),
    }));
  }

  private async readCategories(
    tenantId: string,
    from: Date,
    to: Date,
    queueFilter: Prisma.Sql,
  ): Promise<CategoryInsight[]> {
    const rows = await this.prisma.$queryRaw<Array<{
      categoryId: string | null;
      code: string | null;
      name: string | null;
      calls: bigint | number;
      avgTalkSeconds: number | null;
      negativeCalls: bigint | number;
    }>>`
      SELECT
        c."categoryId"                                     AS "categoryId",
        c."code"                                           AS "code",
        c."name"                                           AS "name",
        COUNT(*)                                           AS "calls",
        AVG(s."talkSeconds") FILTER (WHERE s."talkSeconds" > 0) AS "avgTalkSeconds",
        COUNT(*) FILTER (WHERE a."sentiment" = 'NEGATIVE') AS "negativeCalls"
      FROM "callAnalyses" a
      JOIN "callSessions" s ON s."callId" = a."callId"
      LEFT JOIN "consultCategories" c ON c."categoryId" = a."categoryId"
      WHERE a."tenantId" = ${tenantId}::uuid
        AND s."startedAt" >= ${from}
        AND s."startedAt" <  ${to}
        ${queueFilter}
      GROUP BY c."categoryId", c."code", c."name"
      ORDER BY COUNT(*) DESC
    `;

    return rows.map((row) => ({
      categoryId: row.categoryId,
      code: row.code,
      name: row.name,
      calls: Number(row.calls),
      avgTalkSeconds: Math.round(Number(row.avgTalkSeconds ?? 0)),
      negativeCalls: Number(row.negativeCalls),
    }));
  }

  private async readKeywordCounts(
    tenantId: string,
    from: Date,
    to: Date,
    queueFilter: Prisma.Sql,
  ): Promise<KeywordCount[]> {
    const rows = await this.prisma.$queryRaw<Array<{ keyword: string; calls: bigint | number }>>`
      SELECT k."keyword" AS "keyword", COUNT(*) AS "calls"
      FROM "callAnalyses" a
      JOIN "callSessions" s ON s."callId" = a."callId"
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(a."keywords", '[]'::jsonb)) AS k("keyword")
      WHERE a."tenantId" = ${tenantId}::uuid
        AND s."startedAt" >= ${from}
        AND s."startedAt" <  ${to}
        ${queueFilter}
      GROUP BY k."keyword"
    `;

    return rows.map((row) => ({ keyword: row.keyword, calls: Number(row.calls) }));
  }

  /** 분석이 통화를 얼마나 덮고 있는지. 이 값이 낮으면 아래 분포를 전체로 읽으면 안 된다. */
  private async readCoverage(tenantId: string, from: Date, to: Date, queueFilter: Prisma.Sql) {
    const rows = await this.prisma.$queryRaw<Array<{
      totalCalls: bigint | number;
      analyzedCalls: bigint | number;
    }>>`
      SELECT
        COUNT(*)                                  AS "totalCalls",
        COUNT(a."analysisId")                     AS "analyzedCalls"
      FROM "callSessions" s
      LEFT JOIN "callAnalyses" a ON a."callId" = s."callId"
      WHERE s."tenantId" = ${tenantId}::uuid
        AND s."startedAt" >= ${from}
        AND s."startedAt" <  ${to}
        ${queueFilter}
    `;

    const row = rows[0];
    return {
      totalCalls: Number(row?.totalCalls ?? 0),
      analyzedCalls: Number(row?.analyzedCalls ?? 0),
    };
  }
}
