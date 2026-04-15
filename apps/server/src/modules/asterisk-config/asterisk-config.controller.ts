import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
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
  ) {}

  // Trunks
  @Get('trunks') getTrunks(@CurrentUser() u: any) { return this.svc.getTrunks(u.tenantId); }
  @Post('trunks') createTrunk(@CurrentUser() u: any, @Body() dto: CreateTrunkDto) { return this.svc.createTrunk(u.tenantId, dto); }
  @Put('trunks/:id') updateTrunk(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdateTrunkDto) { return this.svc.updateTrunk(u.tenantId, id, dto); }
  @Delete('trunks/:id') @HttpCode(204) deleteTrunk(@CurrentUser() u: any, @Param('id') id: string) { return this.svc.deleteTrunk(u.tenantId, id); }

  // DIDs
  @Get('dids') getDids(@CurrentUser() u: any) { return this.svc.getDids(u.tenantId); }
  @Post('dids') createDid(@CurrentUser() u: any, @Body() dto: CreateDidDto) { return this.svc.createDid(u.tenantId, dto); }
  @Put('dids/:id') updateDid(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdateDidDto) { return this.svc.updateDid(u.tenantId, id, dto); }
  @Delete('dids/:id') @HttpCode(204) deleteDid(@CurrentUser() u: any, @Param('id') id: string) { return this.svc.deleteDid(u.tenantId, id); }

  // IVR Menus
  @Get('ivr-menus') getIvrMenus(@CurrentUser() u: any) { return this.svc.getIvrMenus(u.tenantId); }
  @Post('ivr-menus') createIvrMenu(@CurrentUser() u: any, @Body() dto: CreateIvrMenuDto) { return this.svc.createIvrMenu(u.tenantId, dto); }
  @Put('ivr-menus/:id') updateIvrMenu(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdateIvrMenuDto) { return this.svc.updateIvrMenu(u.tenantId, id, dto); }
  @Delete('ivr-menus/:id') @HttpCode(204) deleteIvrMenu(@CurrentUser() u: any, @Param('id') id: string) { return this.svc.deleteIvrMenu(u.tenantId, id); }

  // Agent SIP
  @Get('agents-sip') getAgentSip(@CurrentUser() u: any) { return this.svc.getAgentSip(u.tenantId); }
  @Put('agents-sip/:agentId/password') updateAgentSipPassword(
    @CurrentUser() u: any,
    @Param('agentId') agentId: string,
    @Body() dto: UpdateSipPasswordDto,
  ) { return this.svc.updateAgentSipPassword(u.tenantId, agentId, dto.sipPassword); }
  @Post('agents-sip/sync') syncAgentSip(@CurrentUser() u: any) { return this.svc.syncAgentSip(u.tenantId); }

  // Reload + Preview
  @Post('reload') manualReload(@CurrentUser() u: any) { return this.reload.executeReload(u.tenantId); }
  @Get('preview') preview(@CurrentUser() u: any) { return this.reload.previewConfFiles(u.tenantId); }
}
