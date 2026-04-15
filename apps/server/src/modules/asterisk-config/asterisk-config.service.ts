import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AsteriskReloadService } from './asterisk-reload.service';
import { CreateDidDto, UpdateDidDto } from './dto/did.dto';
import { CreateIvrMenuDto, UpdateIvrMenuDto } from './dto/ivr-menu.dto';
import { CreateTrunkDto, UpdateTrunkDto } from './dto/trunk.dto';

@Injectable()
export class AsteriskConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reload: AsteriskReloadService,
  ) {}

  // ─── Trunks ────────────────────────────────────────────────────────────────

  getTrunks(tenantId: string) {
    return this.prisma.asteriskTrunk.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  async createTrunk(tenantId: string, dto: CreateTrunkDto) {
    const trunk = await this.prisma.asteriskTrunk.create({
      data: {
        tenantId,
        ...dto,
        port: dto.port ?? 5060,
        codecs: dto.codecs ?? 'alaw,ulaw',
        enabled: dto.enabled ?? true,
      },
    });
    this.reload.scheduleReload(tenantId);
    return trunk;
  }

  async updateTrunk(tenantId: string, id: string, dto: UpdateTrunkDto) {
    await this.assertTrunkBelongs(tenantId, id);
    const trunk = await this.prisma.asteriskTrunk.update({ where: { id }, data: dto });
    this.reload.scheduleReload(tenantId);
    return trunk;
  }

  async deleteTrunk(tenantId: string, id: string) {
    await this.assertTrunkBelongs(tenantId, id);
    await this.prisma.asteriskTrunk.delete({ where: { id } });
    this.reload.scheduleReload(tenantId);
  }

  private async assertTrunkBelongs(tenantId: string, id: string) {
    const trunk = await this.prisma.asteriskTrunk.findFirst({ where: { id, tenantId } });
    if (!trunk) throw new NotFoundException(`Trunk ${id} not found`);
  }

  // ─── DIDs ──────────────────────────────────────────────────────────────────

  getDids(tenantId: string) {
    return this.prisma.asteriskDid.findMany({ where: { tenantId }, orderBy: { did: 'asc' } });
  }

  async createDid(tenantId: string, dto: CreateDidDto) {
    await this.validateDidXorAndQueue(tenantId, dto);
    const did = await this.prisma.asteriskDid.create({
      data: { tenantId, ...dto, enabled: dto.enabled ?? true },
    });
    this.reload.scheduleReload(tenantId);
    return did;
  }

  async updateDid(tenantId: string, id: string, dto: UpdateDidDto) {
    await this.assertDidBelongs(tenantId, id);
    await this.validateDidXorAndQueue(tenantId, dto);
    const did = await this.prisma.asteriskDid.update({ where: { id }, data: dto });
    this.reload.scheduleReload(tenantId);
    return did;
  }

  async deleteDid(tenantId: string, id: string) {
    await this.assertDidBelongs(tenantId, id);
    await this.prisma.asteriskDid.delete({ where: { id } });
    this.reload.scheduleReload(tenantId);
  }

  private async validateDidXorAndQueue(
    tenantId: string,
    dto: { ivrMenuId?: string; directQueue?: string },
  ) {
    const hasIvr = !!dto.ivrMenuId;
    const hasQueue = !!dto.directQueue;
    if (hasIvr && hasQueue)
      throw new BadRequestException('ivrMenuId and directQueue are mutually exclusive');
    if (!hasIvr && !hasQueue)
      throw new BadRequestException('Either ivrMenuId or directQueue is required');
    if (hasQueue) {
      const queue = await this.prisma.queues.findFirst({
        where: { tenantId, queueName: dto.directQueue },
      });
      if (!queue) throw new BadRequestException(`Queue "${dto.directQueue}" not found`);
    }
  }

  private async assertDidBelongs(tenantId: string, id: string) {
    const did = await this.prisma.asteriskDid.findFirst({ where: { id, tenantId } });
    if (!did) throw new NotFoundException(`DID ${id} not found`);
  }

  // ─── IVR Menus ─────────────────────────────────────────────────────────────

  getIvrMenus(tenantId: string) {
    return this.prisma.asteriskIvrMenu.findMany({
      where: { tenantId },
      include: { entries: { orderBy: { digit: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async createIvrMenu(tenantId: string, dto: CreateIvrMenuDto) {
    await this.validateEntryQueues(tenantId, dto.entries);
    const menu = await this.prisma.asteriskIvrMenu.create({
      data: {
        tenantId,
        name: dto.name,
        welcomePrompt: dto.welcomePrompt,
        menuPrompt: dto.menuPrompt,
        timeoutSecs: dto.timeoutSecs ?? 5,
        entries: { create: dto.entries.map((e) => ({ ...e, tenantId })) },
      },
      include: { entries: true },
    });
    this.reload.scheduleReload(tenantId);
    return menu;
  }

  async updateIvrMenu(tenantId: string, id: string, dto: UpdateIvrMenuDto) {
    await this.assertMenuBelongs(tenantId, id);
    await this.validateEntryQueues(tenantId, dto.entries);
    const menu = await this.prisma.$transaction(async (tx) => {
      await tx.asteriskIvrEntry.deleteMany({ where: { menuId: id } });
      return tx.asteriskIvrMenu.update({
        where: { id },
        data: {
          name: dto.name,
          welcomePrompt: dto.welcomePrompt,
          menuPrompt: dto.menuPrompt,
          timeoutSecs: dto.timeoutSecs ?? 5,
          entries: { create: dto.entries.map((e) => ({ ...e, tenantId })) },
        },
        include: { entries: true },
      });
    });
    this.reload.scheduleReload(tenantId);
    return menu;
  }

  async deleteIvrMenu(tenantId: string, id: string) {
    await this.assertMenuBelongs(tenantId, id);
    await this.prisma.asteriskIvrMenu.delete({ where: { id } });
    this.reload.scheduleReload(tenantId);
  }

  private async validateEntryQueues(tenantId: string, entries: { queueName: string }[]) {
    if (entries.length === 0) return;
    const names = [...new Set(entries.map((e) => e.queueName))];
    const found = await this.prisma.queues.findMany({
      where: { tenantId, queueName: { in: names } },
      select: { queueName: true },
    });
    const foundSet = new Set(found.map((q) => q.queueName));
    const missing = names.filter((n) => !foundSet.has(n));
    if (missing.length > 0) throw new BadRequestException(`Queue(s) not found: ${missing.join(', ')}`);
  }

  private async assertMenuBelongs(tenantId: string, id: string) {
    const menu = await this.prisma.asteriskIvrMenu.findFirst({ where: { id, tenantId } });
    if (!menu) throw new NotFoundException(`IVR menu ${id} not found`);
  }

  // ─── Agent SIP ─────────────────────────────────────────────────────────────

  getAgentSip(tenantId: string) {
    return this.prisma.agents.findMany({
      where: { tenantId, isActive: true },
      select: { agentId: true, agentName: true, extension: true, sipPassword: true },
      orderBy: { extension: 'asc' },
    });
  }

  async updateAgentSipPassword(tenantId: string, agentId: string, sipPassword: string) {
    const agent = await this.prisma.agents.findFirst({ where: { agentId, tenantId } });
    if (!agent) throw new NotFoundException(`Agent ${agentId} not found`);
    return this.prisma.agents.update({ where: { agentId }, data: { sipPassword } });
  }

  async syncAgentSip(tenantId: string) {
    await this.reload.executeReload(tenantId);
  }
}
