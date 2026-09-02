import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequiresFeature } from '../../common/decorators/requires-feature.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { FeatureEntitlementGuard } from '../../common/guards/feature-entitlement.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { MenuPermissionService, PermissionAction } from '../../common/menu-permission.service';
import { RequiresWriteAvailability } from '../resilience/write-availability.decorator';
import { ArsHttpEndpointsService } from './ars-http-endpoints.service';
import { TestArsHttpEndpointDto, UpsertArsHttpEndpointDto } from './dto/ars-http-endpoint.dto';

// ARS 플로우와 같은 권한 키를 쓴다. 새 메뉴 키를 만들지 않는다.
const ARS_MENU_KEY = 'asterisk';

@ApiTags('ars-http-lookup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, FeatureEntitlementGuard)
@RequiresFeature('ars-http-lookup')
@Controller('admin/ars-http-endpoints')
@RequiresWriteAvailability('general')
// 외부 통신을 여는 설정이다. 쓰기 저하 모드에서는 끊는다.
export class ArsHttpEndpointsController {
  constructor(
    private readonly endpoints: ArsHttpEndpointsService,
    private readonly menuPermissionService: MenuPermissionService,
  ) {}

  @Get()
  @Roles('supervisor', 'admin')
  @ApiOperation({
    summary: '외부 조회 엔드포인트 목록',
    description: '자격증명은 담기지 않는다. 등록 여부만 `hasSecret` 으로 알려준다.',
  })
  async list(@Req() req: any) {
    await this.assert(req, 'view');
    return this.endpoints.list(req.user.tenantId);
  }

  @Get(':endpointId')
  @Roles('supervisor', 'admin')
  @ApiOperation({ summary: '외부 조회 엔드포인트 조회' })
  async get(@Req() req: any, @Param('endpointId') endpointId: string) {
    await this.assert(req, 'view');
    return this.endpoints.get(req.user.tenantId, endpointId);
  }

  // 등록·수정·삭제는 admin 전용이다. 플로우 편집(supervisor)과 등급이 다르다 —
  // 외부 통신을 여는 행위이기 때문이다.
  @Post()
  @Roles('admin')
  @ApiOperation({ summary: '외부 조회 엔드포인트 등록' })
  async create(@Req() req: any, @Body() dto: UpsertArsHttpEndpointDto) {
    await this.assert(req, 'create');
    return this.endpoints.create(req.user.tenantId, dto);
  }

  @Patch(':endpointId')
  @Roles('admin')
  @ApiOperation({
    summary: '외부 조회 엔드포인트 수정',
    description: '`authSecret` 을 생략하면 기존 자격증명을 그대로 둔다.',
  })
  async update(
    @Req() req: any,
    @Param('endpointId') endpointId: string,
    @Body() dto: UpsertArsHttpEndpointDto,
  ) {
    await this.assert(req, 'update');
    return this.endpoints.update(req.user.tenantId, endpointId, dto);
  }

  @Delete(':endpointId')
  @Roles('admin')
  @ApiOperation({ summary: '외부 조회 엔드포인트 삭제' })
  async remove(@Req() req: any, @Param('endpointId') endpointId: string) {
    await this.assert(req, 'delete');
    return this.endpoints.remove(req.user.tenantId, endpointId);
  }

  @Post(':endpointId/test')
  @Roles('admin')
  @ApiOperation({
    summary: '외부 조회 테스트 호출',
    description:
      '통화 경로와 같은 서비스를 탄다 — 차단기·타임아웃·값 깎기까지 똑같이 겪는다. '
      + '전화를 걸기 전에 진짜 문제를 보려는 것이다.',
  })
  async test(
    @Req() req: any,
    @Param('endpointId') endpointId: string,
    @Body() dto: TestArsHttpEndpointDto,
  ) {
    await this.assert(req, 'operate');
    return this.endpoints.test(req.user.tenantId, endpointId, dto);
  }

  private assert(req: any, action: PermissionAction) {
    return this.menuPermissionService.assertMenuAction(
      req.user.tenantId,
      req.user.role,
      ARS_MENU_KEY,
      action,
      req.user.sub,
    );
  }
}
