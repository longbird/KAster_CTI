import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequiresFeature } from '../../common/decorators/requires-feature.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { FeatureEntitlementGuard } from '../../common/guards/feature-entitlement.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { MenuPermissionService, PermissionAction } from '../../common/menu-permission.service';
import { RequiresWriteAvailability } from '../resilience/write-availability.decorator';
import { ArsFlowService } from './ars-flow.service';
import { CreateArsFlowDto } from './dto/create-ars-flow.dto';
import { ImportIvrMenuDto } from './dto/import-ivr-menu.dto';
import { PreviewArsFlowQueryDto } from './dto/preview-ars-flow.query.dto';
import { ReplaceArsFlowGraphDto } from './dto/replace-ars-flow-graph.dto';

// PBX 설정 화면과 같은 권한을 쓴다. 새 메뉴 키를 만들지 않는다.
const ARS_FLOW_MENU_KEY = 'asterisk';

@ApiTags('ars-flow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, FeatureEntitlementGuard)
@RequiresFeature('ars-flow-builder')
@Controller('admin/ars-flows')
@RequiresWriteAvailability('general')
// PBX dialplan 으로 컴파일되는 설정이다. 쓰기 저하 모드에서는 끊는다.
// GET(목록·조회·미리보기)은 WriteAvailabilityGuard 를 그대로 통과한다.
export class ArsFlowController {
  constructor(
    private readonly arsFlow: ArsFlowService,
    private readonly menuPermissionService: MenuPermissionService,
  ) {}

  @Get()
  @Roles('supervisor', 'admin')
  @ApiOperation({ summary: 'ARS 플로우 목록' })
  async list(@Req() req: any) {
    await this.assert(req, 'view');
    return this.arsFlow.list(req.user.tenantId);
  }

  @Get(':flowId')
  @Roles('supervisor', 'admin')
  @ApiOperation({ summary: 'ARS 플로우 그래프 조회', description: '노드·엣지와 편집기 좌표를 함께 준다.' })
  async get(@Req() req: any, @Param('flowId') flowId: string) {
    await this.assert(req, 'view');
    return this.arsFlow.get(req.user.tenantId, flowId);
  }

  @Post()
  @Roles('supervisor', 'admin')
  @ApiOperation({ summary: 'ARS 플로우 생성', description: '빈 DRAFT 플로우를 만든다.' })
  async create(@Req() req: any, @Body() dto: CreateArsFlowDto) {
    await this.assert(req, 'create');
    return this.arsFlow.create(req.user.tenantId, dto);
  }

  @Post('import/ivr-menu')
  @Roles('supervisor', 'admin')
  @ApiOperation({
    summary: '기존 IVR 메뉴를 플로우로 가져오기',
    description:
      '기존 단층 IVR 메뉴를 DRAFT 플로우로 옮긴다. 원래 메뉴와 DID 연결은 건드리지 않으므로'
      + ' 확인 전까지 통화는 기존 경로로 흐른다. notes 에 사람이 확인해야 할 점이 담긴다.',
  })
  async importIvrMenu(@Req() req: any, @Body() dto: ImportIvrMenuDto) {
    await this.assert(req, 'create');
    return this.arsFlow.importFromIvrMenu(req.user.tenantId, dto.menuId);
  }

  @Patch(':flowId/graph')
  @Roles('supervisor', 'admin')
  @ApiOperation({
    summary: 'ARS 플로우 그래프 교체',
    description:
      '노드와 엣지를 한 덩어리로 갈아끼운다. 개별 CRUD 가 아닌 이유는 편집 중간 상태가 '
      + '매번 검증에 걸리기 때문이다. 검증 오류가 하나라도 있으면 아무것도 저장하지 않는다.',
  })
  async replaceGraph(
    @Req() req: any,
    @Param('flowId') flowId: string,
    @Body() dto: ReplaceArsFlowGraphDto,
  ) {
    await this.assert(req, 'update');
    return this.arsFlow.replaceGraph(req.user.tenantId, flowId, dto as any);
  }

  @Post(':flowId/validate')
  @Roles('supervisor', 'admin')
  @ApiOperation({
    summary: 'ARS 플로우 검증',
    description: '저장하지 않고 오류와 경고만 돌려준다. 오류는 저장을 막고, 경고는 막지 않는다.',
  })
  async validate(
    @Req() req: any,
    @Param('flowId') flowId: string,
    @Body() dto: ReplaceArsFlowGraphDto,
  ) {
    await this.assert(req, 'view');
    return this.arsFlow.validate(req.user.tenantId, flowId, dto as any);
  }

  @Get(':flowId/preview')
  @Roles('supervisor', 'admin')
  @ApiOperation({
    summary: 'ARS 플로우 컴파일 미리보기',
    description: '컴파일된 dialplan 문자열만 돌려준다. 파일을 쓰거나 PBX 를 reload 하지 않는다.',
  })
  async preview(
    @Req() req: any,
    @Param('flowId') flowId: string,
    @Query() query: PreviewArsFlowQueryDto,
  ) {
    await this.assert(req, 'view');
    return this.arsFlow.preview(req.user.tenantId, flowId, query.did);
  }

  @Delete(':flowId')
  @Roles('supervisor', 'admin')
  @ApiOperation({
    summary: 'ARS 플로우 삭제',
    description: '이 플로우를 쓰던 DID 는 사라지지 않고 기존 표준 경로로 되돌아간다.',
  })
  async remove(@Req() req: any, @Param('flowId') flowId: string) {
    await this.assert(req, 'delete');
    return this.arsFlow.remove(req.user.tenantId, flowId);
  }

  private assert(req: any, action: PermissionAction) {
    return this.menuPermissionService.assertMenuAction(
      req.user.tenantId,
      req.user.role,
      ARS_FLOW_MENU_KEY,
      action,
      req.user.sub,
    );
  }
}
