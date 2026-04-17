import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { AgentStateService } from '../calls/agent-state.service';
import { AgentsService } from './agents.service';
import { ChangeAgentStatusDto } from './dto/change-agent-status.dto';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

const SUPERVISORY_ROLES = new Set(['supervisor', 'admin']);

@ApiTags('agents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly agentStateService: AgentStateService,
    private readonly agentsService: AgentsService,
    private readonly menuPermissionService: MenuPermissionService,
  ) {}

  @Get()
  async list(@CurrentUser() user: any) {
    if (SUPERVISORY_ROLES.has(user.role)) {
      await this.menuPermissionService.assertAnyMenuAction(
        user.tenantId,
        user.role,
        ['settings/agents', 'agents'],
        'view',
      );
    }
    return this.agentsService.listForTenant(user.tenantId);
  }

  @Get(':agentId')
  async detail(@CurrentUser() user: any, @Param('agentId') agentId: string) {
    if (user.sub !== agentId && SUPERVISORY_ROLES.has(user.role)) {
      await this.menuPermissionService.assertAnyMenuAction(
        user.tenantId,
        user.role,
        ['settings/agents', 'agents'],
        'view',
      );
    }
    return this.agentsService.getDetail(user.tenantId, agentId);
  }

  @Get(':agentId/history')
  async history(
    @CurrentUser() user: any,
    @Param('agentId') agentId: string,
    @Query('limit') limit?: string,
  ) {
    if (user.sub !== agentId && SUPERVISORY_ROLES.has(user.role)) {
      await this.menuPermissionService.assertAnyMenuAction(
        user.tenantId,
        user.role,
        ['settings/agents', 'agents'],
        'view',
      );
    }
    return this.agentsService.getHistory(
      user.tenantId,
      agentId,
      limit ? Number(limit) : 50,
    );
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('supervisor', 'admin')
  async create(@CurrentUser() user: any, @Body() dto: CreateAgentDto) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/agents', 'create');
    return this.agentsService.create(user.tenantId, dto);
  }

  @Delete(':agentId')
  @UseGuards(RolesGuard)
  @Roles('supervisor', 'admin')
  async deactivate(@CurrentUser() user: any, @Param('agentId') agentId: string) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/agents', 'delete');
    return this.agentsService.deactivate(user.tenantId, agentId);
  }

  @Post(':agentId/reset-password')
  @UseGuards(RolesGuard)
  @Roles('supervisor', 'admin')
  async resetPassword(@CurrentUser() user: any, @Param('agentId') agentId: string) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/agents', 'operate');
    return this.agentsService.resetPassword(user.tenantId, agentId);
  }

  @Patch(':agentId')
  @UseGuards(RolesGuard)
  @Roles('supervisor', 'admin')
  async update(
    @CurrentUser() user: any,
    @Param('agentId') agentId: string,
    @Body() dto: UpdateAgentDto,
  ) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/agents', 'update');
    return this.agentsService.update(user.tenantId, agentId, dto);
  }

  @Post(':agentId/status')
  async changeStatus(
    @CurrentUser() user: any,
    @Param('agentId') agentId: string,
    @Body() dto: ChangeAgentStatusDto,
  ) {
    if (user.sub !== agentId && !SUPERVISORY_ROLES.has(user.role)) {
      throw new ForbiddenException('본인 또는 supervisor/admin 만 허용');
    }
    const row = await this.agentStateService.changeStatus(
      agentId,
      dto.statusCode,
      dto.reasonCode,
    );
    return { success: true, data: row, error: null };
  }
}
