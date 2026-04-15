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
  exports: [MetricsService],
})
export class MonitoringModule {}
