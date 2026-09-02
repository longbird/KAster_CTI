import { Module } from '@nestjs/common';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { PrismaService } from '../../common/prisma.service';
import { AmiModule } from '../ami/ami.module';
import { DashboardSnapshotService } from './dashboard-snapshot.service';
import { CallInsightsService } from './insights/call-insights.service';
import { SnapshotRetentionService } from './snapshot-retention.service';
import { TrendQueryService } from './trend-query.service';
import { TrendsController } from './trends.controller';

/**
 * 관리자 추이 분석.
 *
 * 적재(DashboardSnapshotService)와 조회(TrendQueryService)를 함께 담는다.
 * 적재가 화면보다 먼저 들어간 이유는, 늦게 시작하면 그만큼의 과거가 영원히 비기 때문이다.
 *
 * `AmiLeaderElectionService` 는 `RedisModule` 이 `@Global()` 이라 따로 import 하지 않는다.
 */
@Module({
  imports: [AmiModule],
  controllers: [TrendsController],
  providers: [
    DashboardSnapshotService,
    CallInsightsService,
    SnapshotRetentionService,
    TrendQueryService,
    MenuPermissionService,
    PrismaService,
  ],
  exports: [DashboardSnapshotService, TrendQueryService],
})
export class TrendsModule {}
