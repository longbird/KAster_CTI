import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { HealthSummaryService } from './health-summary.service';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthSummary: HealthSummaryService) {}

  @Get()
  @ApiOperation({
    summary: '운영형 상태 모니터링',
    description: 'DB/Redis/AMI + Call/Agent/Queue 요약 상태를 반환합니다.',
  })
  @ApiQuery({
    name: 'tenantId',
    required: false,
    type: String,
    description: '멀티테넌트: 특정 tenant 기준으로 콜/에이전트/큐 집계',
  })
  @ApiOkResponse({ type: HealthResponseDto })
  async health(@Query('tenantId') tenantId?: string): Promise<HealthResponseDto> {
    return this.healthSummary.getHealth(tenantId);
  }

  // k8s readinessProbe 용: DB + Redis 가 살아있으면 ready
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  async readiness() {
    const data = await this.healthSummary.getHealth();
    return {
      success: data.status !== 'down',
      data: { ready: data.checks.db === 'up' && data.checks.redis !== 'down' },
      error: null,
    };
  }

  // k8s livenessProbe 용: 프로세스가 살아있으면 OK
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  liveness() {
    return { success: true, data: { alive: true }, error: null };
  }
}
