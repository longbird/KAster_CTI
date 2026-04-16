import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { AsteriskConfigService } from './asterisk-config.service';
import { AsteriskReloadService } from './asterisk-reload.service';
import { CreateDidDto, UpdateDidDto } from './dto/did.dto';
import { CreateIvrMenuDto, UpdateIvrMenuDto } from './dto/ivr-menu.dto';
import { CreateTrunkDto, UpdateTrunkDto } from './dto/trunk.dto';
import { UpdateSipPasswordDto } from './dto/update-sip-password.dto';

@ApiTags('asterisk-config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('supervisor', 'admin')
@Controller('asterisk-config')
export class AsteriskConfigController {
  constructor(
    private readonly svc: AsteriskConfigService,
    private readonly reload: AsteriskReloadService,
    private readonly menuPermissionService: MenuPermissionService,
  ) {}

  private async assertAsteriskAccess(user: any) {
    await this.menuPermissionService.assertMenuAccess(user.tenantId, user.role, 'asterisk');
  }

  // Trunks
  @Get('trunks') async getTrunks(@CurrentUser() u: any) { await this.assertAsteriskAccess(u); return this.svc.getTrunks(u.tenantId); }
  @Post('trunks') async createTrunk(@CurrentUser() u: any, @Body() dto: CreateTrunkDto) { await this.assertAsteriskAccess(u); return this.svc.createTrunk(u.tenantId, dto); }
  @Put('trunks/:id') async updateTrunk(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdateTrunkDto) { await this.assertAsteriskAccess(u); return this.svc.updateTrunk(u.tenantId, id, dto); }
  @Delete('trunks/:id') @HttpCode(204) @ApiResponse({ status: 204, description: 'Deleted' }) async deleteTrunk(@CurrentUser() u: any, @Param('id') id: string) { await this.assertAsteriskAccess(u); return this.svc.deleteTrunk(u.tenantId, id); }

  // DIDs
  @Get('dids') async getDids(@CurrentUser() u: any) { await this.assertAsteriskAccess(u); return this.svc.getDids(u.tenantId); }
  @Post('dids') async createDid(@CurrentUser() u: any, @Body() dto: CreateDidDto) { await this.assertAsteriskAccess(u); return this.svc.createDid(u.tenantId, dto); }
  @Put('dids/:id') async updateDid(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdateDidDto) { await this.assertAsteriskAccess(u); return this.svc.updateDid(u.tenantId, id, dto); }
  @Delete('dids/:id') @HttpCode(204) @ApiResponse({ status: 204, description: 'Deleted' }) async deleteDid(@CurrentUser() u: any, @Param('id') id: string) { await this.assertAsteriskAccess(u); return this.svc.deleteDid(u.tenantId, id); }

  // IVR Menus
  @Get('ivr-menus') async getIvrMenus(@CurrentUser() u: any) { await this.assertAsteriskAccess(u); return this.svc.getIvrMenus(u.tenantId); }
  @Post('ivr-menus') async createIvrMenu(@CurrentUser() u: any, @Body() dto: CreateIvrMenuDto) { await this.assertAsteriskAccess(u); return this.svc.createIvrMenu(u.tenantId, dto); }
  @Put('ivr-menus/:id') async updateIvrMenu(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdateIvrMenuDto) { await this.assertAsteriskAccess(u); return this.svc.updateIvrMenu(u.tenantId, id, dto); }
  @Delete('ivr-menus/:id') @HttpCode(204) @ApiResponse({ status: 204, description: 'Deleted' }) async deleteIvrMenu(@CurrentUser() u: any, @Param('id') id: string) { await this.assertAsteriskAccess(u); return this.svc.deleteIvrMenu(u.tenantId, id); }

  // Agent SIP
  @Get('agents-sip') async getAgentSip(@CurrentUser() u: any) { await this.assertAsteriskAccess(u); return this.svc.getAgentSip(u.tenantId); }
  @Put('agents-sip/:agentId/password') async updateAgentSipPassword(
    @CurrentUser() u: any,
    @Param('agentId') agentId: string,
    @Body() dto: UpdateSipPasswordDto,
  ) { await this.assertAsteriskAccess(u); return this.svc.updateAgentSipPassword(u.tenantId, agentId, dto.sipPassword); }
  @Post('agents-sip/sync') async syncAgentSip(@CurrentUser() u: any) { await this.assertAsteriskAccess(u); return this.svc.syncAgentSip(u.tenantId); }

  // Reload + Preview
  @Post('reload') async manualReload(@CurrentUser() u: any) { await this.assertAsteriskAccess(u); return this.reload.executeReload(u.tenantId); }
  @Get('preview') async preview(@CurrentUser() u: any) { await this.assertAsteriskAccess(u); return this.reload.previewConfFiles(u.tenantId); }
}
