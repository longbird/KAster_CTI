import { Global, Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';
import { MetricsService } from './metrics.service';
import { createMetricsRegistry, METRICS_REGISTRY } from './metrics.registry';
import { HealthModule } from '../health/health.module';

@Global()
@Module({
  imports: [HealthModule],
  controllers: [MonitoringController],
  providers: [
    {
      provide: METRICS_REGISTRY,
      useFactory: () => createMetricsRegistry(),
    },
    MetricsService,
  ],
  // 다른 모듈이 자기 지표를 같은 레지스트리에 등록할 수 있게 함께 내보낸다.
  exports: [MetricsService, METRICS_REGISTRY],
})
export class MonitoringModule {}
