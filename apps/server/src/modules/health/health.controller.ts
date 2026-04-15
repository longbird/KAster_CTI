import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { AmiConnectionService } from '../ami/ami-connection.service';
import { AmiLeaderElectionService } from '../redis/ami-leader-election.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ami: AmiConnectionService,
    private readonly leader: AmiLeaderElectionService,
  ) {}

  // 기본 liveness: 인증 없이 LB/k8s 에서 폴링 가능.
  @Get()
  @ApiOperation({ summary: '기본 헬스체크 (인증 없음)' })
  async getHealth() {
    let dbOk = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }

    let redisOk = false;
    try {
      const ping = await this.redis.ping();
      redisOk = ping === 'PONG';
    } catch {
      redisOk = false;
    }

    const healthy = dbOk && redisOk;
    return {
      success: true,
      data: {
        status: healthy ? 'ok' : 'degraded',
        db: dbOk,
        redis: redisOk,
        amiConnected: this.ami.isConnected(),
        isLeader: this.leader.isLeader(),
        timestamp: new Date().toISOString(),
      },
      error: null,
    };
  }

  // 운영 지표: 인증 필요. Grafana/Prometheus scrape 이 아니라 개발/디버깅 용도.
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('detailed')
  @ApiOperation({ summary: '상세 운영 지표 (JWT 필요)' })
  async getDetailedHealth() {
    const [outboxBacklog, staleSessions, recentRawEvents] = await Promise.all([
      this.prisma.eventOutbox.count({ where: { publishedAt: null } }),
      this.prisma.callSessions.count({
        where: {
          sessionStatus: { notIn: ['ENDED'] },
          updatedAt: { lt: new Date(Date.now() - 10 * 60_000) },
        },
      }),
      this.prisma.rawAmiEvents.findFirst({
        orderBy: { eventTime: 'desc' },
        select: { eventTime: true, eventName: true },
      }),
    ]);

    const amiLastEventAt = recentRawEvents?.eventTime?.toISOString() ?? null;
    const amiLagSeconds = recentRawEvents?.eventTime
      ? Math.floor((Date.now() - recentRawEvents.eventTime.getTime()) / 1000)
      : null;

    return {
      success: true,
      data: {
        status: 'ok',
        amiConnected: this.ami.isConnected(),
        isLeader: this.leader.isLeader(),
        amiLastEventAt,
        amiLastEventName: recentRawEvents?.eventName ?? null,
        amiLagSeconds,
        outboxBacklog,
        staleSessions,
        timestamp: new Date().toISOString(),
      },
      error: null,
    };
  }
}
