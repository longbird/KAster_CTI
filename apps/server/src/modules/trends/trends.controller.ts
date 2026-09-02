import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/current-user.decorator';
import { RequiresFeature } from '../../common/decorators/requires-feature.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { FeatureEntitlementGuard } from '../../common/guards/feature-entitlement.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { ListTrendsQueryDto } from './dto/list-trends.query.dto';
import { CallInsightsService } from './insights/call-insights.service';
import { TrendQueryService } from './trend-query.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, FeatureEntitlementGuard)
@Controller('admin')
export class TrendsController {
  constructor(
    private readonly trendQuery: TrendQueryService,
    private readonly callInsights: CallInsightsService,
    private readonly menuPermissionService: MenuPermissionService,
  ) {}

  @Get('trends')
  @Roles('supervisor', 'admin')
  @ApiOperation({
    summary: '운영 추이 조회',
    description:
      '호 인입/응답/포기는 통화 이력에서 요청 시점에 집계하고, 대기·상담원·리소스는 '
      + '주기 스냅샷에서 읽어 한 시간축으로 합친다. 스냅샷이 없는 구간의 지표는 null 이며 '
      + '(적재 이전이거나 서버가 멈췄던 구간) 0 과 구분해야 한다.',
  })
  async trends(@CurrentUser() user: any, @Query() query: ListTrendsQueryDto) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'trends', 'view', user.sub);
    return this.trendQuery.query(user.tenantId, query);
  }

  @Get('call-insights')
  @Roles('supervisor', 'admin')
  // 운영 추이는 자격과 무관하다. AI 인사이트 탭만 막는다.
  @RequiresFeature('ai-insights')
  @ApiOperation({
    summary: '통화 AI 인사이트 조회',
    description:
      '감정 추이·상담분류 분포·급상승 키워드를 요청 시점에 집계한다. 분석은 통화 종료 뒤에 '
      + '도착하므로 스냅샷에 적재하지 않는다. `totals` 의 analyzedCalls/totalCalls 가 분석 커버리지이며, '
      + '이 값이 낮으면 아래 분포를 전체 통화의 분포로 읽으면 안 된다. 급상승 키워드는 요청 구간 '
      + '바로 앞의 같은 길이 구간과 비교한 결과다.',
  })
  async callInsightsQuery(@CurrentUser() user: any, @Query() query: ListTrendsQueryDto) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'trends', 'view', user.sub);
    return this.callInsights.query(user.tenantId, query);
  }
}
