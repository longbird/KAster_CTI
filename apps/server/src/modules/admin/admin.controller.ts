import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { AdminService } from './admin.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { ListAmiLogsQueryDto } from './dto/list-ami-logs-query.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { UpdateBranchMappingsDto } from './dto/update-branch-mappings.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';

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
    await this.menuPermissionService.assertMenuAccess(user.tenantId, user.role, 'dashboard');
    return this.adminService.getDashboard(user.tenantId, branchId);
  }

  @Get('reports/ami-logs')
  @Roles('supervisor', 'admin')
  async listAmiLogs(@CurrentUser() user: any, @Query() q: ListAmiLogsQueryDto) {
    await this.menuPermissionService.assertMenuAccess(user.tenantId, user.role, 'reports/logs');
    return this.adminService.listAmiLogs(user.tenantId, q);
  }

  @Get('announcements')
  @Roles('supervisor', 'admin')
  async listAnnouncements(@CurrentUser() user: any) {
    await this.menuPermissionService.assertMenuAccess(user.tenantId, user.role, 'announcements');
    return this.adminService.listAnnouncements(user.tenantId);
  }

  @Post('announcements')
  @Roles('supervisor', 'admin')
  async createAnnouncement(@CurrentUser() user: any, @Body() dto: CreateAnnouncementDto) {
    await this.menuPermissionService.assertMenuAccess(user.tenantId, user.role, 'announcements');
    return this.adminService.createAnnouncement(user.tenantId, dto, {
      agentName: user.agentName,
    });
  }

  @Delete('announcements/:announcementId')
  @Roles('supervisor', 'admin')
  async deleteAnnouncement(@CurrentUser() user: any, @Param('announcementId') announcementId: string) {
    await this.menuPermissionService.assertMenuAccess(user.tenantId, user.role, 'announcements');
    return this.adminService.deleteAnnouncement(user.tenantId, announcementId);
  }

  @Get('settings/branches')
  @Roles('supervisor', 'admin')
  async listBranches(@CurrentUser() user: any) {
    await this.menuPermissionService.assertMenuAccess(user.tenantId, user.role, 'settings/branches');
    return this.adminService.listBranches(user.tenantId);
  }

  @Post('settings/branches')
  @Roles('supervisor', 'admin')
  async createBranch(@CurrentUser() user: any, @Body() dto: CreateBranchDto) {
    await this.menuPermissionService.assertMenuAccess(user.tenantId, user.role, 'settings/branches');
    return this.adminService.createBranch(user.tenantId, dto);
  }

  @Post('settings/permissions')
  @Roles('supervisor', 'admin')
  async updateRolePermissions(@CurrentUser() user: any, @Body() dto: UpdateRolePermissionsDto) {
    await this.menuPermissionService.assertMenuAccess(user.tenantId, user.role, 'settings/permissions');
    return this.adminService.updateRolePermissions(user.tenantId, dto);
  }

  @Get('settings/permissions')
  @Roles('supervisor', 'admin')
  async listRolePermissions(@CurrentUser() user: any) {
    await this.menuPermissionService.assertMenuAccess(user.tenantId, user.role, 'settings/permissions');
    return this.adminService.listRolePermissions(user.tenantId);
  }

  @Post('settings/branches/:branchId')
  @Roles('supervisor', 'admin')
  async updateBranch(
    @CurrentUser() user: any,
    @Param('branchId') branchId: string,
    @Body() dto: UpdateBranchDto,
  ) {
    await this.menuPermissionService.assertMenuAccess(user.tenantId, user.role, 'settings/branches');
    return this.adminService.updateBranch(user.tenantId, branchId, dto);
  }

  @Delete('settings/branches/:branchId')
  @Roles('supervisor', 'admin')
  async deleteBranch(@CurrentUser() user: any, @Param('branchId') branchId: string) {
    await this.menuPermissionService.assertMenuAccess(user.tenantId, user.role, 'settings/branches');
    return this.adminService.deleteBranch(user.tenantId, branchId);
  }

  @Get('settings/branches/:branchId/mappings')
  @Roles('supervisor', 'admin')
  async getBranchMappings(@CurrentUser() user: any, @Param('branchId') branchId: string) {
    await this.menuPermissionService.assertMenuAccess(user.tenantId, user.role, 'settings/branches');
    return this.adminService.getBranchMappings(user.tenantId, branchId);
  }

  @Post('settings/branches/:branchId/mappings')
  @Roles('supervisor', 'admin')
  async updateBranchMappings(
    @CurrentUser() user: any,
    @Param('branchId') branchId: string,
    @Body() dto: UpdateBranchMappingsDto,
  ) {
    await this.menuPermissionService.assertMenuAccess(user.tenantId, user.role, 'settings/branches');
    return this.adminService.updateBranchMappings(user.tenantId, branchId, dto);
  }
}
