import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Put, Res, ServiceUnavailableException, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { AsteriskConfigService } from './asterisk-config.service';
import { AsteriskReloadService } from './asterisk-reload.service';
import { CreateBlocklistEntryDto, ImportBlocklistEntriesDto, UpdateBlocklistEntryDto } from './dto/blocklist-entry.dto';
import { CreateDidDto, UpdateDidDto } from './dto/did.dto';
import { CreateForwardingRuleDto, UpdateForwardingRuleDto } from './dto/forwarding-rule.dto';
import { CreateIvrMenuDto, UpdateIvrMenuDto } from './dto/ivr-menu.dto';
import { CreatePromptDto, UpdatePromptDto } from './dto/prompt.dto';
import { CreateBulkTrunksDto, CreateTrunkDto, UpdateTrunkDto } from './dto/trunk.dto';
import { UpdateSipPasswordDto } from './dto/update-sip-password.dto';
import { ExecuteOptOutActionDto } from '../opt-out/dto/execute-opt-out-action.dto';
import { ExecuteSmartOptOutDto } from '../opt-out/dto/execute-smart-opt-out.dto';
import { OptOutService } from '../opt-out/opt-out.service';
import { ExecuteSmartArsActionDto } from '../smart-ars/dto/execute-smart-ars-action.dto';
import { SmartArsRuntimeService } from '../smart-ars/smart-ars-runtime.service';

interface UploadedPromptAudioFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

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
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'asterisk', 'view', user.sub);
  }

  private async assertPromptAccess(user: any) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/prompts', 'view', user.sub);
  }

  private async assertBlocklistAccess(user: any) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'blocklist', 'view', user.sub);
  }

  private async assertAsteriskAction(user: any, action: 'create' | 'update' | 'delete' | 'operate') {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'asterisk', action, user.sub);
  }

  private async assertPromptAction(user: any, action: 'create' | 'update' | 'delete') {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/prompts', action, user.sub);
  }

  private async assertPromptWriteAccess(user: any) {
    await this.menuPermissionService.assertAnyMenuAction(
      user.tenantId,
      user.role,
      ['settings/prompts'],
      'create',
      user.sub,
    ).catch(async () => {
      await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/prompts', 'update', user.sub);
    });
  }

  private async assertBlocklistAction(user: any, action: 'create' | 'update' | 'delete') {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'blocklist', action, user.sub);
  }

  // Trunks
  @Get('trunks') async getTrunks(@CurrentUser() u: any) { await this.assertAsteriskAccess(u); return this.svc.getTrunks(u.tenantId); }
  @Post('trunks') async createTrunk(@CurrentUser() u: any, @Body() dto: CreateTrunkDto) { await this.assertAsteriskAction(u, 'create'); return this.svc.createTrunk(u.tenantId, dto); }
  @Post('trunks/bulk') async createTrunksBulk(@CurrentUser() u: any, @Body() dto: CreateBulkTrunksDto) { await this.assertAsteriskAction(u, 'create'); return this.svc.createTrunksBulk(u.tenantId, dto); }
  @Put('trunks/:id') async updateTrunk(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdateTrunkDto) { await this.assertAsteriskAction(u, 'update'); return this.svc.updateTrunk(u.tenantId, id, dto); }
  @Delete('trunks/:id') @HttpCode(204) @ApiResponse({ status: 204, description: 'Deleted' }) async deleteTrunk(@CurrentUser() u: any, @Param('id') id: string) { await this.assertAsteriskAction(u, 'delete'); return this.svc.deleteTrunk(u.tenantId, id); }

  // DIDs
  @Get('dids') async getDids(@CurrentUser() u: any) { await this.assertAsteriskAccess(u); return this.svc.getDids(u.tenantId); }
  @Post('dids') async createDid(@CurrentUser() u: any, @Body() dto: CreateDidDto) { await this.assertAsteriskAction(u, 'create'); return this.svc.createDid(u.tenantId, dto); }
  @Put('dids/:id') async updateDid(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdateDidDto) { await this.assertAsteriskAction(u, 'update'); return this.svc.updateDid(u.tenantId, id, dto); }
  @Delete('dids/:id') @HttpCode(204) @ApiResponse({ status: 204, description: 'Deleted' }) async deleteDid(@CurrentUser() u: any, @Param('id') id: string) { await this.assertAsteriskAction(u, 'delete'); return this.svc.deleteDid(u.tenantId, id); }

  // IVR Menus
  @Get('ivr-menus') async getIvrMenus(@CurrentUser() u: any) { await this.assertAsteriskAccess(u); return this.svc.getIvrMenus(u.tenantId); }
  @Post('ivr-menus') async createIvrMenu(@CurrentUser() u: any, @Body() dto: CreateIvrMenuDto) { await this.assertAsteriskAction(u, 'create'); return this.svc.createIvrMenu(u.tenantId, dto); }
  @Put('ivr-menus/:id') async updateIvrMenu(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdateIvrMenuDto) { await this.assertAsteriskAction(u, 'update'); return this.svc.updateIvrMenu(u.tenantId, id, dto); }
  @Delete('ivr-menus/:id') @HttpCode(204) @ApiResponse({ status: 204, description: 'Deleted' }) async deleteIvrMenu(@CurrentUser() u: any, @Param('id') id: string) { await this.assertAsteriskAction(u, 'delete'); return this.svc.deleteIvrMenu(u.tenantId, id); }

  // Agent SIP
  @Get('agents-sip') async getAgentSip(@CurrentUser() u: any) { await this.assertAsteriskAccess(u); return this.svc.getAgentSip(u.tenantId); }
  @Put('agents-sip/:agentId/password') async updateAgentSipPassword(
    @CurrentUser() u: any,
    @Param('agentId') agentId: string,
    @Body() dto: UpdateSipPasswordDto,
  ) { await this.assertAsteriskAction(u, 'update'); return this.svc.updateAgentSipPassword(u.tenantId, agentId, dto.sipPassword); }
  @Post('agents-sip/sync') async syncAgentSip(@CurrentUser() u: any) { await this.assertAsteriskAction(u, 'operate'); return this.svc.syncAgentSip(u.tenantId); }

  // Forwarding Rules
  @Get('forwarding-rules') async getForwardingRules(@CurrentUser() u: any) { await this.assertAsteriskAccess(u); return this.svc.getForwardingRules(u.tenantId); }
  @Post('forwarding-rules') async createForwardingRule(@CurrentUser() u: any, @Body() dto: CreateForwardingRuleDto) { await this.assertAsteriskAction(u, 'create'); return this.svc.createForwardingRule(u.tenantId, dto); }
  @Put('forwarding-rules/:id') async updateForwardingRule(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdateForwardingRuleDto) { await this.assertAsteriskAction(u, 'update'); return this.svc.updateForwardingRule(u.tenantId, id, dto); }
  @Delete('forwarding-rules/:id') @HttpCode(204) @ApiResponse({ status: 204, description: 'Deleted' }) async deleteForwardingRule(@CurrentUser() u: any, @Param('id') id: string) { await this.assertAsteriskAction(u, 'delete'); return this.svc.deleteForwardingRule(u.tenantId, id); }

  // Prompts
  @Get('prompts') async getPrompts(@CurrentUser() u: any) { await this.assertPromptAccess(u); return this.svc.getPrompts(u.tenantId); }
  @Post('prompts') async createPrompt(@CurrentUser() u: any, @Body() dto: CreatePromptDto) { await this.assertPromptAction(u, 'create'); return this.svc.createPrompt(u.tenantId, dto); }
  @Post('prompts/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async uploadPromptAudio(@CurrentUser() u: any, @UploadedFile() file?: UploadedPromptAudioFile) {
    await this.assertPromptWriteAccess(u);
    return this.svc.uploadPromptAudio(u.tenantId, file);
  }
  @Get('prompts/:id/stream')
  async streamPromptAudio(@CurrentUser() u: any, @Param('id') id: string, @Res() res: Response) {
    await this.assertPromptAccess(u);
    const audio = await this.svc.getPromptAudioFile(u.tenantId, id);
    res.setHeader('Content-Type', audio.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(audio.fileName)}"`);
    return res.sendFile(audio.filePath);
  }
  @Put('prompts/:id') async updatePrompt(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdatePromptDto) { await this.assertPromptAction(u, 'update'); return this.svc.updatePrompt(u.tenantId, id, dto); }
  @Delete('prompts/:id') @HttpCode(204) @ApiResponse({ status: 204, description: 'Deleted' }) async deletePrompt(@CurrentUser() u: any, @Param('id') id: string) { await this.assertPromptAction(u, 'delete'); return this.svc.deletePrompt(u.tenantId, id); }

  // 080 Blocklist
  @Get('blocklist') async getBlocklistEntries(@CurrentUser() u: any) { await this.assertBlocklistAccess(u); return this.svc.getBlocklistEntries(u.tenantId); }
  @Post('blocklist') async createBlocklistEntry(@CurrentUser() u: any, @Body() dto: CreateBlocklistEntryDto) { await this.assertBlocklistAction(u, 'create'); return this.svc.createBlocklistEntry(u.tenantId, dto); }
  @Post('blocklist/import') async importBlocklistEntries(@CurrentUser() u: any, @Body() dto: ImportBlocklistEntriesDto) { await this.assertBlocklistAction(u, 'create'); return this.svc.importBlocklistEntries(u.tenantId, dto.rows); }
  @Put('blocklist/:id') async updateBlocklistEntry(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdateBlocklistEntryDto) { await this.assertBlocklistAction(u, 'update'); return this.svc.updateBlocklistEntry(u.tenantId, id, dto); }
  @Delete('blocklist/:id') @HttpCode(204) @ApiResponse({ status: 204, description: 'Deleted' }) async deleteBlocklistEntry(@CurrentUser() u: any, @Param('id') id: string) { await this.assertBlocklistAction(u, 'delete'); return this.svc.deleteBlocklistEntry(u.tenantId, id); }

  // Reload + Preview
  @Post('reload') async manualReload(@CurrentUser() u: any) { await this.assertAsteriskAction(u, 'operate'); return this.reload.executeReload(u.tenantId); }
  @Get('preview') async preview(@CurrentUser() u: any) { await this.assertAsteriskAccess(u); return this.reload.previewConfFiles(u.tenantId); }
}

@ApiTags('asterisk-config-internal')
@Controller('asterisk-config/internal/opt-out')
export class AsteriskConfigInternalController {
  constructor(
    private readonly optOutService: OptOutService,
    private readonly reload: AsteriskReloadService,
    private readonly config: ConfigService,
  ) {}

  private assertInternalSecret(secretHeader?: string) {
    const configuredSecret = this.config.get<string>('KASTER_INTERNAL_SECRET')?.trim();

    if (!configuredSecret) {
      throw new ServiceUnavailableException(
        'KASTER_INTERNAL_SECRET must be configured for internal opt-out execution',
      );
    }

    if (secretHeader?.trim() !== configuredSecret) {
      throw new UnauthorizedException('Invalid internal secret');
    }
  }

  @Post('register')
  async register(
    @Headers('x-kaster-internal-secret') secretHeader: string | undefined,
    @Body() dto: ExecuteOptOutActionDto,
  ) {
    this.assertInternalSecret(secretHeader);
    const result = await this.optOutService.register(dto);
    this.reload.scheduleReload(result.tenantId);
    return result;
  }

  @Post('unregister')
  async unregister(
    @Headers('x-kaster-internal-secret') secretHeader: string | undefined,
    @Body() dto: ExecuteOptOutActionDto,
  ) {
    this.assertInternalSecret(secretHeader);
    const result = await this.optOutService.unregister(dto);
    this.reload.scheduleReload(result.tenantId);
    return result;
  }

  @Post('smart/register')
  async registerSmart(
    @Headers('x-kaster-internal-secret') secretHeader: string | undefined,
    @Body() dto: ExecuteSmartOptOutDto,
  ) {
    this.assertInternalSecret(secretHeader);
    const result = await this.optOutService.register(dto);
    this.reload.scheduleReload(result.tenantId);
    return result;
  }

  @Post('smart/unregister')
  async unregisterSmart(
    @Headers('x-kaster-internal-secret') secretHeader: string | undefined,
    @Body() dto: ExecuteSmartOptOutDto,
  ) {
    this.assertInternalSecret(secretHeader);
    const result = await this.optOutService.unregister(dto);
    this.reload.scheduleReload(result.tenantId);
    return result;
  }
}

@ApiTags('asterisk-config-internal')
@Controller('asterisk-config/internal/smart-ars')
export class SmartArsInternalController {
  constructor(
    private readonly smartArsRuntimeService: SmartArsRuntimeService,
    private readonly reload: AsteriskReloadService,
    private readonly config: ConfigService,
  ) {}

  private assertInternalSecret(secretHeader?: string) {
    const configuredSecret = this.config.get<string>('KASTER_INTERNAL_SECRET')?.trim();

    if (!configuredSecret) {
      throw new ServiceUnavailableException(
        'KASTER_INTERNAL_SECRET must be configured for internal Smart ARS execution',
      );
    }

    if (secretHeader?.trim() !== configuredSecret) {
      throw new UnauthorizedException('Invalid internal secret');
    }
  }

  @Post('sms')
  async smartArsSms(
    @Headers('x-kaster-internal-secret') secretHeader: string | undefined,
    @Body() dto: ExecuteSmartArsActionDto,
  ) {
    this.assertInternalSecret(secretHeader);
    return this.smartArsRuntimeService.sendSms(dto);
  }

  @Post('opt-out')
  async smartArsOptOut(
    @Headers('x-kaster-internal-secret') secretHeader: string | undefined,
    @Body() dto: ExecuteSmartArsActionDto,
  ) {
    this.assertInternalSecret(secretHeader);
    const result = await this.smartArsRuntimeService.registerOptOut(dto);
    this.reload.scheduleReload(result.tenantId);
    return result;
  }
}
