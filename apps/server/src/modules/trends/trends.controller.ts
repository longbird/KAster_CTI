import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { ListTrendsQueryDto } from './dto/list-trends.query.dto';
import { TrendQueryService } from './trend-query.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class TrendsController {
  constructor(
    private readonly trendQuery: TrendQueryService,
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
}
