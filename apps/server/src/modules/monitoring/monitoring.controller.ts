import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MetricsService } from './metrics.service';

// Swagger 에서 제외: /metrics 는 Prometheus scrape 전용이며 외부 노출 금지.
// Prometheus scrape 시 Authorization: Bearer <admin-jwt> 헤더 설정 필요.
@ApiExcludeController()
@Controller()
export class MonitoringController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics(@Query('tenantId') tenantId?: string): Promise<string> {
    return this.metricsService.getMetrics(tenantId);
  }
}
