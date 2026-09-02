import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RecordingPipelineModule } from '../recording-pipeline/recording-pipeline.module';
import { RedisModule } from '../redis/redis.module';
import { AnalysisService } from './analysis.service';
import { CallAnalysisController } from './call-analysis.controller';
import { CallAnalysisQueryService } from './call-analysis-query.service';
import { CallAnalysisReconcileService } from './call-analysis-reconcile.service';
import { CallAnalysisSweeperService } from './call-analysis-sweeper.service';
import { CallAnalysisProviderFactory } from './providers/provider.factory';
import { TranscriptionService } from './transcription.service';

@Module({
  // 녹취 복호는 파이프라인 서비스를 그대로 재사용한다. 의존 방향은 이쪽 한 방향뿐이다.
  imports: [RecordingPipelineModule, RedisModule],
  controllers: [CallAnalysisController],
  providers: [
    PrismaService,
    CallAnalysisProviderFactory,
    TranscriptionService,
    AnalysisService,
    CallAnalysisSweeperService,
    CallAnalysisReconcileService,
    CallAnalysisQueryService,
  ],
  exports: [CallAnalysisSweeperService],
})
export class CallAnalysisModule {}
