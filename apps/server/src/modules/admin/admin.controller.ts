import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { AdminService } from './admin.service';
import { CreateAgentGroupDto } from './dto/create-agent-group.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateAgentBranchCallerIdsDto } from './dto/update-agent-branch-caller-ids.dto';
import { ListAmiLogsQueryDto } from './dto/list-ami-logs-query.dto';
import { ListIvrFailuresQueryDto } from './dto/list-ivr-failures-query.dto';
import { ListAgentWorkTimeQueryDto } from './dto/list-agent-work-time-query.dto';
import { ListRecordingDownloadAuditsQueryDto } from './dto/list-recording-download-audits-query.dto';
import { UpdateAgentGroupDto } from './dto/update-agent-group.dto';
import { UpdateAgentPermissionsDto } from './dto/update-agent-permissions.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { UpdateBranchMappingsDto } from './dto/update-branch-mappings.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly menuPermissionService: MenuPermissionService,
  ) {}

  @Get('dashboard')
  @Roles('supervisor', 'admin')
  async dashboard(@CurrentUser() user: any, @Query('branchId') branchId?: string) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'dashboard', 'view', user.sub);
    return this.adminService.getDashboard(user.tenantId, branchId);
  }

  @Get('reports/ami-logs')
  @Roles('supervisor', 'admin')
  async listAmiLogs(@CurrentUser() user: any, @Query() q: ListAmiLogsQueryDto) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'reports/logs', 'view', user.sub);
    return this.adminService.listAmiLogs(user.tenantId, q);
  }

  @Get('reports/ivr-failures')
  @Roles('supervisor', 'admin')
  async listIvrFailures(@CurrentUser() user: any, @Query() q: ListIvrFailuresQueryDto) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'reports/ivr-failures', 'view', user.sub);
    return this.adminService.listIvrFailures(user.tenantId, q);
  }

  @Get('reports/recording-download-audits')
  @Roles('supervisor', 'admin')
  async listRecordingDownloadAudits(@CurrentUser() user: any, @Query() q: ListRecordingDownloadAuditsQueryDto) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'reports/recordings', 'view', user.sub);
    return this.adminService.listRecordingDownloadAudits(user.tenantId, q);
  }

  @Get('reports/agent-work-time')
  @Roles('supervisor', 'admin')
  async listAgentWorkTime(@CurrentUser() user: any, @Query() q: ListAgentWorkTimeQueryDto) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'kpi', 'view', user.sub);
    return this.adminService.listAgentWorkTime(user.tenantId, q);
  }

  @Get('monitoring/operations')
  @Roles('supervisor', 'admin')
  async getOperationalMonitoring(@CurrentUser() user: any) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'monitoring', 'view', user.sub);
    return this.adminService.getOperationalMonitoring(user.tenantId);
  }

  @Get('announcements')
  @Roles('supervisor', 'admin')
  async listAnnouncements(@CurrentUser() user: any) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'announcements', 'view', user.sub);
    return this.adminService.listAnnouncements(user.tenantId);
  }

  @Post('announcements')
  @Roles('supervisor', 'admin')
  async createAnnouncement(@CurrentUser() user: any, @Body() dto: CreateAnnouncementDto) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'announcements', 'create', user.sub);
    return this.adminService.createAnnouncement(user.tenantId, dto, {
      agentName: user.agentName,
    });
  }

  @Post('announcements/:announcementId')
  @Roles('supervisor', 'admin')
  async updateAnnouncement(
    @CurrentUser() user: any,
    @Param('announcementId') announcementId: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'announcements', 'update', user.sub);
    return this.adminService.updateAnnouncement(user.tenantId, announcementId, dto, {
      agentName: user.agentName,
    });
  }

  @Delete('announcements/:announcementId')
  @Roles('supervisor', 'admin')
  async deleteAnnouncement(@CurrentUser() user: any, @Param('announcementId') announcementId: string) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'announcements', 'delete', user.sub);
    return this.adminService.deleteAnnouncement(user.tenantId, announcementId);
  }

  // -------- Agent Groups (BlueSky StaffGroup 등가) --------
  @Get('settings/agent-groups')
  @Roles('supervisor', 'admin')
  async listAgentGroups(@CurrentUser() user: any) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      'settings/agent-groups',
      'view',
      user.sub,
    );
    return this.adminService.listAgentGroups(user.tenantId);
  }

  @Post('settings/agent-groups')
  @Roles('supervisor', 'admin')
  async createAgentGroup(@CurrentUser() user: any, @Body() dto: CreateAgentGroupDto) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      'settings/agent-groups',
      'create',
      user.sub,
    );
    return this.adminService.createAgentGroup(user.tenantId, dto, { agentId: user.sub });
  }

  @Post('settings/agent-groups/:agentGroupId')
  @Roles('supervisor', 'admin')
  async updateAgentGroup(
    @CurrentUser() user: any,
    @Param('agentGroupId') agentGroupId: string,
    @Body() dto: UpdateAgentGroupDto,
  ) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      'settings/agent-groups',
      'update',
      user.sub,
    );
    return this.adminService.updateAgentGroup(user.tenantId, agentGroupId, dto, {
      agentId: user.sub,
    });
  }

  @Delete('settings/agent-groups/:agentGroupId')
  @Roles('supervisor', 'admin')
  async deleteAgentGroup(
    @CurrentUser() user: any,
    @Param('agentGroupId') agentGroupId: string,
  ) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      'settings/agent-groups',
      'delete',
      user.sub,
    );
    return this.adminService.deleteAgentGroup(user.tenantId, agentGroupId);
  }

  // -------- 상담원-지사 CID 발신권한 매트릭스 (BlueSky JisaPossibleAuth 등가) --------
  @Get('settings/branches/:branchId/agent-caller-ids')
  @Roles('supervisor', 'admin')
  async listBranchAgentCallerIds(
    @CurrentUser() user: any,
    @Param('branchId') branchId: string,
  ) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      'settings/branches',
      'view',
      user.sub,
    );
    return this.adminService.listBranchAgentCallerIds(user.tenantId, branchId);
  }

  @Post('settings/branches/:branchId/agent-caller-ids')
  @Roles('supervisor', 'admin')
  async updateBranchAgentCallerIds(
    @CurrentUser() user: any,
    @Param('branchId') branchId: string,
    @Body() dto: UpdateAgentBranchCallerIdsDto,
  ) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      'settings/branches',
      'update',
      user.sub,
    );
    return this.adminService.updateBranchAgentCallerIds(user.tenantId, branchId, dto);
  }

  @Get('agents/:agentId/caller-id-permissions')
  @Roles('supervisor', 'admin')
  async listAgentCallerIdPermissions(
    @CurrentUser() user: any,
    @Param('agentId') agentId: string,
  ) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      'settings/agents',
      'view',
      user.sub,
    );
    return this.adminService.listAgentCallerIdPermissions(user.tenantId, agentId);
  }

  @Get('settings/branches')
  @Roles('supervisor', 'admin')
  async listBranches(@CurrentUser() user: any): Promise<any> {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/branches', 'view', user.sub);
    return this.adminService.listBranches(user.tenantId);
  }

  @Post('settings/branches')
  @Roles('supervisor', 'admin')
  async createBranch(@CurrentUser() user: any, @Body() dto: CreateBranchDto) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/branches', 'create', user.sub);
    return this.adminService.createBranch(user.tenantId, dto);
  }

  @Get('settings/permissions/current')
  @Roles('supervisor', 'admin')
  async getCurrentPermissionProfile(@CurrentUser() user: any) {
    return this.adminService.getCurrentPermissionProfile(user.tenantId, user.sub, user.role);
  }

  @Post('settings/permissions')
  @Roles('supervisor', 'admin')
  async updateRolePermissions(@CurrentUser() user: any, @Body() dto: UpdateRolePermissionsDto) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/permissions', 'operate', user.sub);
    return this.adminService.updateRolePermissions(user.tenantId, dto);
  }

  @Get('settings/permissions')
  @Roles('supervisor', 'admin')
  async listRolePermissions(@CurrentUser() user: any) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/permissions', 'view', user.sub);
    return this.adminService.listRolePermissions(user.tenantId);
  }

  @Get('settings/permissions/accounts/:agentId')
  @Roles('supervisor', 'admin')
  async getAgentPermissionProfile(@CurrentUser() user: any, @Param('agentId') agentId: string) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/permissions', 'view', user.sub);
    return this.adminService.getAgentPermissionProfile(user.tenantId, agentId);
  }

  @Post('settings/permissions/accounts/:agentId')
  @Roles('supervisor', 'admin')
  async updateAgentPermissions(
    @CurrentUser() user: any,
    @Param('agentId') agentId: string,
    @Body() dto: UpdateAgentPermissionsDto,
  ) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/permissions', 'operate', user.sub);
    return this.adminService.updateAgentPermissions(user.tenantId, agentId, dto);
  }

  @Get('settings/system')
  @Roles('supervisor', 'admin')
  async getSystemSettings(@CurrentUser() user: any) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'system', 'view', user.sub);
    return this.adminService.getSystemSettings(user.tenantId);
  }

  @Get('settings/system/time-sync')
  @Roles('supervisor', 'admin')
  async getSystemTimeSyncStatus(@CurrentUser() user: any) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'system', 'view', user.sub);
    return this.adminService.getSystemTimeSyncStatus();
  }

  @Post('settings/system')
  @Roles('supervisor', 'admin')
  async updateSystemSettings(@CurrentUser() user: any, @Body() dto: UpdateSystemSettingsDto) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'system', 'update', user.sub);
    return this.adminService.updateSystemSettings(user.tenantId, dto);
  }

  @Post('settings/branches/:branchId')
  @Roles('supervisor', 'admin')
  async updateBranch(
    @CurrentUser() user: any,
    @Param('branchId') branchId: string,
    @Body() dto: UpdateBranchDto,
  ) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/branches', 'update', user.sub);
    return this.adminService.updateBranch(user.tenantId, branchId, dto);
  }

  @Delete('settings/branches/:branchId')
  @Roles('supervisor', 'admin')
  async deleteBranch(@CurrentUser() user: any, @Param('branchId') branchId: string) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/branches', 'delete', user.sub);
    return this.adminService.deleteBranch(user.tenantId, branchId);
  }

  @Get('settings/branches/:branchId/mappings')
  @Roles('supervisor', 'admin')
  async getBranchMappings(@CurrentUser() user: any, @Param('branchId') branchId: string): Promise<any> {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/branches', 'view', user.sub);
    return this.adminService.getBranchMappings(user.tenantId, branchId);
  }

  @Post('settings/branches/:branchId/mappings')
  @Roles('supervisor', 'admin')
  async updateBranchMappings(
    @CurrentUser() user: any,
    @Param('branchId') branchId: string,
    @Body() dto: UpdateBranchMappingsDto,
  ): Promise<any> {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/branches', 'operate', user.sub);
    return this.adminService.updateBranchMappings(user.tenantId, branchId, dto);
  }
}
