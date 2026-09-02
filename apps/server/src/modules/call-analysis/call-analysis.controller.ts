import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequiresFeature } from '../../common/decorators/requires-feature.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { FeatureEntitlementGuard } from '../../common/guards/feature-entitlement.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RequiresWriteAvailability } from '../resilience/write-availability.decorator';
import { CallAnalysisQueryService } from './call-analysis-query.service';

@ApiTags('call-analysis')
@ApiBearerAuth()
// FeatureEntitlementGuard 는 JwtAuthGuard 뒤에 온다 — 테넌트를 request.user 에서 읽는다.
@UseGuards(JwtAuthGuard, RolesGuard, FeatureEntitlementGuard)
@RequiresFeature('call-analysis')
@Controller('calls')
@RequiresWriteAvailability('general')
// 분석 재요청은 통화 제어가 아니라 job 행을 쓰는 운영 작업이다. 쓰기 저하 모드에서는 명확히 끊는다.
// GET(전문·분석 조회)은 WriteAvailabilityGuard 를 그대로 통과한다.
export class CallAnalysisController {
  constructor(private readonly query: CallAnalysisQueryService) {}

  @Get(':callId/transcript')
  @ApiOperation({
    summary: '통화 전문 조회',
    description: '화자별 세그먼트를 시간순으로 함께 준다. 본인 통화 또는 supervisor/admin 만 볼 수 있다.',
  })
  async getTranscript(@Req() req: any, @Param('callId') callId: string) {
    return this.query.getTranscript(req.user.tenantId, callId, req.user);
  }

  @Get(':callId/analysis')
  @ApiOperation({
    summary: '통화 AI 분석 조회',
    description: '요약·감정·키워드·상담분류를 준다.',
  })
  async getAnalysis(@Req() req: any, @Param('callId') callId: string) {
    return this.query.getAnalysis(req.user.tenantId, callId, req.user);
  }

  @Post(':callId/analysis/retry')
  @Roles('supervisor', 'admin')
  @ApiOperation({
    summary: '통화 분석 재요청',
    description: '확정된 녹취를 전사 단계부터 다시 큐에 넣는다. 실제 처리는 sweep 이 이어서 한다.',
  })
  async retry(@Req() req: any, @Param('callId') callId: string) {
    return this.query.retry(req.user.tenantId, callId);
  }
}
