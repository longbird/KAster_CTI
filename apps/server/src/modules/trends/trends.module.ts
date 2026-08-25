import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AmiModule } from '../ami/ami.module';
import { DashboardSnapshotService } from './dashboard-snapshot.service';
import { SnapshotRetentionService } from './snapshot-retention.service';

/**
 * 관리자 추이 분석.
 *
 * 1단계는 적재만 한다. 화면이 없어도 오늘부터 데이터가 쌓이기 시작해야
 * 나중에 만든 화면이 과거를 보여줄 수 있다. 적재를 늦게 시작하면 그만큼의
 * 과거는 영원히 빈다.
 *
 * `AmiLeaderElectionService` 는 `RedisModule` 이 `@Global()` 이라 따로 import 하지 않는다.
 */
@Module({
  imports: [AmiModule],
  providers: [DashboardSnapshotService, SnapshotRetentionService, PrismaService],
  exports: [DashboardSnapshotService],
})
export class TrendsModule {}
