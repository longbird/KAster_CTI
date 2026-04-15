import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RedisModule } from '../redis/redis.module';
import { AmiModule } from '../ami/ami.module';
import { HealthController } from './health.controller';
import { HealthSummaryService } from './health-summary.service';
import { CallsHealthService } from '../calls/calls-health.service';
import { AgentMonitoringService } from '../agents/agent-monitoring.service';
import { QueueMonitoringService } from '../queues/queue-monitoring.service';

@Module({
  imports: [RedisModule, AmiModule],
  controllers: [HealthController],
  providers: [
    PrismaService,
    CallsHealthService,
    AgentMonitoringService,
    QueueMonitoringService,
    HealthSummaryService,
  ],
  exports: [HealthSummaryService],
})
export class HealthModule {}
