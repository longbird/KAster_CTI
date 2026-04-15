import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

// Swagger 에서 제외: /metrics 는 Prometheus scrape 전용이며 외부 노출 금지.
// nginx/ingress 에서 내부 네트워크만 허용하도록 설정 필요.
@ApiExcludeController()
@Controller()
export class MonitoringController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics(@Query('tenantId') tenantId?: string): Promise<string> {
    return this.metrics.getMetrics(tenantId);
  }
}
