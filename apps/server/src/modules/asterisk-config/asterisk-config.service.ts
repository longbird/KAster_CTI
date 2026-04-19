import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { AmiConnectionService } from '../ami/ami-connection.service';
import { ParsedAmiFrame } from '../ami/ami.parser';
import { AsteriskReloadService } from './asterisk-reload.service';
import {
  DEFAULT_DISTRIBUTION_RULE_DISPLAY_NAME,
  DEFAULT_DISTRIBUTION_RULE_QUEUE_NAME,
} from '../../common/call-routing.constants';
import { CreateBlocklistEntryDto, UpdateBlocklistEntryDto } from './dto/blocklist-entry.dto';
import { CreateDidDto, UpdateDidDto } from './dto/did.dto';
import { CreateForwardingRuleDto, UpdateForwardingRuleDto } from './dto/forwarding-rule.dto';
import { CreateIvrMenuDto, UpdateIvrMenuDto } from './dto/ivr-menu.dto';
import { CreatePromptDto, UpdatePromptDto } from './dto/prompt.dto';
import { CreateBulkTrunksDto, CreateTrunkDto, UpdateTrunkDto } from './dto/trunk.dto';

@Injectable()
export class AsteriskConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reload: AsteriskReloadService,
    private readonly ami: AmiConnectionService,
  ) {}

  // ─── Trunks ────────────────────────────────────────────────────────────────

  getTrunks(tenantId: string) {
    return this.prisma.asteriskTrunk.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  async createTrunk(tenantId: string, dto: CreateTrunkDto) {
    const normalized = this.normalizeTrunkInput(dto);
    const trunk = await this.prisma.asteriskTrunk.create({
      data: {
        tenantId,
        ...normalized,
      },
    });
    this.reload.scheduleReload(tenantId);
    return trunk;
  }

  async createTrunksBulk(tenantId: string, dto: CreateBulkTrunksDto) {
    const entries = dto.entries.map((entry, index) =>
      this.normalizeTrunkInput({
        name: entry.name?.trim() || this.buildBulkTrunkName(dto.namePrefix, index + 1),
        host: entry.host?.trim() || dto.host?.trim() || '',
        port: entry.port ?? dto.port,
        username: dto.username,
        password: dto.password,
        fromDomain: dto.fromDomain,
        codecs: dto.codecs,
        enabled: dto.enabled,
      }),
    );

    const created = await this.prisma.$transaction(
      entries.map((entry) =>
        this.prisma.asteriskTrunk.create({
          data: {
            tenantId,
            ...entry,
          },
        }),
      ),
    );

    this.reload.scheduleReload(tenantId);
    return created;
  }

  /** Full-replace PUT — all fields must be provided. */
  async updateTrunk(tenantId: string, id: string, dto: UpdateTrunkDto) {
    await this.assertTrunkBelongs(tenantId, id);
    const trunk = await this.prisma.asteriskTrunk.update({
      where: { id },
      data: this.normalizeTrunkInput(dto),
    });
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

  private buildBulkTrunkName(prefix: string | undefined, order: number) {
    const normalizedPrefix = prefix?.trim();
    return normalizedPrefix ? `${normalizedPrefix} ${order}` : `Trunk ${order}`;
  }

  private normalizeTrunkInput(dto: CreateTrunkDto) {
    const username = dto.username?.trim() ?? '';
    const password = dto.password?.trim() ?? '';
    if ((username && !password) || (!username && password)) {
      throw new BadRequestException('username and password must both be provided or both be empty');
    }

    return {
      name: dto.name.trim(),
      host: dto.host.trim(),
      port: dto.port ?? 5060,
      username,
      password,
      fromDomain: dto.fromDomain?.trim() ?? '',
      codecs: dto.codecs ?? 'alaw,ulaw',
      enabled: dto.enabled ?? true,
    };
  }

  // ─── DIDs ──────────────────────────────────────────────────────────────────

  getDids(tenantId: string) {
    return this.prisma.asteriskDid.findMany({
      where: { tenantId },
      include: {
        branchMappings: {
          include: {
            branch: {
              select: { branchId: true, branchCode: true, branchName: true },
            },
          },
        },
      },
      orderBy: { did: 'asc' },
    });
  }

  async createDid(tenantId: string, dto: CreateDidDto) {
    const normalized = await this.normalizeDidRouting(tenantId, dto);
    await this.validateDidXorAndQueue(tenantId, normalized);
    const data: Prisma.AsteriskDidUncheckedCreateInput = {
      tenantId,
      did: normalized.did!,
      representativeNumber: normalized.representativeNumber ?? null,
      description: normalized.description ?? null,
      ivrMenuId: normalized.ivrMenuId ?? null,
      directQueue: normalized.directQueue ?? null,
      enabled: normalized.enabled ?? true,
    };
    const did = await this.prisma.asteriskDid.create({
      data,
    });
    this.reload.scheduleReload(tenantId);
    return did;
  }

  /**
   * Full-replace PUT — all routing fields (ivrMenuId / directQueue) must be provided.
   * The XOR validation treats the incoming DTO as the complete new state.
   */
  async updateDid(tenantId: string, id: string, dto: UpdateDidDto) {
    await this.assertDidBelongs(tenantId, id);
    const normalized = await this.normalizeDidRouting(tenantId, dto);
    await this.validateDidXorAndQueue(tenantId, normalized);
    const data: Prisma.AsteriskDidUncheckedUpdateInput = {
      did: normalized.did,
      representativeNumber: normalized.representativeNumber ?? null,
      description: normalized.description ?? null,
      ivrMenuId: normalized.ivrMenuId ?? null,
      directQueue: normalized.directQueue ?? null,
      enabled: normalized.enabled ?? true,
    };
    const did = await this.prisma.asteriskDid.update({ where: { id }, data });
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

  private async normalizeDidRouting(
    tenantId: string,
    dto: CreateDidDto | UpdateDidDto,
  ): Promise<CreateDidDto | UpdateDidDto> {
    if (dto.ivrMenuId) return dto;
    if (dto.directQueue) return dto;

    const defaultQueue = await this.ensureDefaultDistributionQueue(tenantId);
    return { ...dto, directQueue: defaultQueue.queueName };
  }

  private async ensureDefaultDistributionQueue(tenantId: string) {
    const existing = await this.prisma.queues.findFirst({
      where: { tenantId, queueName: DEFAULT_DISTRIBUTION_RULE_QUEUE_NAME },
    });
    if (existing) {
      await this.syncDefaultDistributionMembers(tenantId, existing.queueId);
      return existing;
    }

    const queueExtens = await this.prisma.queues.findMany({
      where: { tenantId },
      select: { queueExten: true },
    });
    const used = new Set(queueExtens.map((item) => item.queueExten));
    let queueExten = '9999';
    for (let candidate = 9999; candidate < 11000; candidate += 1) {
      const value = String(candidate);
      if (!used.has(value)) {
        queueExten = value;
        break;
      }
    }

    const created = await this.prisma.queues.create({
      data: {
        tenantId,
        queueName: DEFAULT_DISTRIBUTION_RULE_QUEUE_NAME,
        queueExten,
        queueDisplayName: DEFAULT_DISTRIBUTION_RULE_DISPLAY_NAME,
        strategy: 'leastrecent',
        ringTimeoutSeconds: 15,
        wrapupSeconds: 30,
        maxWaitSeconds: 45,
        autopause: true,
        isActive: true,
      },
    });
    await this.syncDefaultDistributionMembers(tenantId, created.queueId);
    return created;
  }

  private async syncDefaultDistributionMembers(tenantId: string, queueId: string) {
    const activeAgents = await this.prisma.agents.findMany({
      where: { tenantId, isActive: true },
      select: { agentId: true },
      orderBy: { agentCode: 'asc' },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.queueAgentMembers.deleteMany({ where: { queueId } });
      if (activeAgents.length === 0) return;
      await tx.queueAgentMembers.createMany({
        data: activeAgents.map((agent, index) => ({
          tenantId,
          queueId,
          agentId: agent.agentId,
          penalty: 0,
          memberOrder: index,
          isActive: true,
        })),
      });
    });
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
    await this.validatePromptRefs(tenantId, dto.welcomePrompt, dto.menuPrompt);
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

  /** Full-replace PUT — all fields including entries[] must be provided. */
  async updateIvrMenu(tenantId: string, id: string, dto: UpdateIvrMenuDto) {
    await this.assertMenuBelongs(tenantId, id);
    await this.validateEntryQueues(tenantId, dto.entries);
    await this.validatePromptRefs(tenantId, dto.welcomePrompt, dto.menuPrompt);
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

  private async validatePromptRefs(tenantId: string, ...promptKeys: Array<string | undefined>) {
    const keys = [...new Set(promptKeys.filter((value): value is string => Boolean(value)))];
    if (keys.length === 0) return;

    const prompts = await this.prisma.asteriskPrompt.findMany({
      where: { tenantId, promptKey: { in: keys }, isActive: true },
      select: { promptKey: true },
    });
    const found = new Set(prompts.map((item) => item.promptKey));
    const missing = keys.filter((key) => !found.has(key));
    if (missing.length > 0) {
      throw new BadRequestException(`Prompt(s) not found or inactive: ${missing.join(', ')}`);
    }
  }

  // ─── Agent SIP ─────────────────────────────────────────────────────────────

  getAgentSip(tenantId: string) {
    return Promise.all([
      this.prisma.agents.findMany({
        where: { tenantId, isActive: true },
        select: { agentId: true, agentName: true, extension: true, sipPassword: true },
        orderBy: { extension: 'asc' },
      }),
      this.prisma.tenantSystemSettings.findUnique({
        where: { tenantId },
        select: { defaultSipPassword: true },
      }),
      this.fetchPjsipContacts(),
    ]).then(([agents, settings, contactFrames]) => {
      const defaultSipPassword = settings?.defaultSipPassword ?? null;
      const contactsByExtension = this.indexContactsByExtension(contactFrames);
      return agents.map((agent) => ({
        ...agent,
        effectiveSipPassword: agent.sipPassword || defaultSipPassword,
        usesSiteDefault: !agent.sipPassword && !!defaultSipPassword,
        registrationStatus: contactsByExtension[agent.extension]?.registrationStatus ?? 'UNREGISTERED',
        contactUri: contactsByExtension[agent.extension]?.contactUri ?? null,
        userAgent: contactsByExtension[agent.extension]?.userAgent ?? null,
        roundtripUsec: contactsByExtension[agent.extension]?.roundtripUsec ?? null,
      }));
    });
  }

  private async fetchPjsipContacts(): Promise<ParsedAmiFrame[]> {
    try {
      return await this.ami.sendActionWithResponse(
        { Action: 'PJSIPShowContacts' },
        { eventList: true, timeoutMs: 5000 },
      );
    } catch {
      return [];
    }
  }

  private indexContactsByExtension(frames: ParsedAmiFrame[]) {
    const indexed: Record<string, {
      registrationStatus: string;
      contactUri: string | null;
      userAgent: string | null;
      roundtripUsec: number | null;
    }> = {};

    for (const frame of frames) {
      if (frame.Event !== 'ContactList') continue;
      const endpointName = frame.Endpoint?.trim();
      const objectName = frame.ObjectName ?? '';
      const extension = endpointName || objectName.split('/')[0]?.trim();
      if (!extension || !/^\d+$/.test(extension)) continue;

      indexed[extension] = {
        registrationStatus: frame.Status ?? 'UNKNOWN',
        contactUri: frame.Uri ?? frame.URI ?? frame.Contact ?? null,
        userAgent: frame.UserAgent ?? null,
        roundtripUsec: frame.RoundtripUsec ? Number(frame.RoundtripUsec) : null,
      };
    }

    return indexed;
  }

  async updateAgentSipPassword(tenantId: string, agentId: string, sipPassword: string) {
    const agent = await this.prisma.agents.findFirst({ where: { agentId, tenantId } });
    if (!agent) throw new NotFoundException(`Agent ${agentId} not found`);
    await this.prisma.agents.updateMany({
      where: { agentId, tenantId },
      data: { sipPassword: sipPassword.trim() || null },
    });
    return this.prisma.agents.findFirst({ where: { agentId, tenantId } });
  }

  async syncAgentSip(tenantId: string) {
    await this.reload.executeReload(tenantId);
  }

  // ─── Forwarding Rules ──────────────────────────────────────────────────────

  getForwardingRules(tenantId: string) {
    return this.prisma.asteriskForwardingRules.findMany({
      where: { tenantId },
      include: {
        did: {
          select: {
            id: true,
            did: true,
            description: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createForwardingRule(tenantId: string, dto: CreateForwardingRuleDto) {
    await this.validateForwardingRule(tenantId, dto);
    const rule = await this.prisma.asteriskForwardingRules.create({
      data: {
        tenantId,
        didId: dto.didId,
        forwardType: dto.forwardType,
        targetValue: dto.targetValue,
        description: dto.description,
        enabled: dto.enabled ?? true,
      },
      include: {
        did: {
          select: {
            id: true,
            did: true,
            description: true,
          },
        },
      },
    });
    this.reload.scheduleReload(tenantId);
    return rule;
  }

  async updateForwardingRule(tenantId: string, id: string, dto: UpdateForwardingRuleDto) {
    await this.assertForwardingRuleBelongs(tenantId, id);
    await this.validateForwardingRule(tenantId, dto, id);
    const rule = await this.prisma.asteriskForwardingRules.update({
      where: { id },
      data: {
        didId: dto.didId,
        forwardType: dto.forwardType,
        targetValue: dto.targetValue,
        description: dto.description,
        enabled: dto.enabled ?? true,
      },
      include: {
        did: {
          select: {
            id: true,
            did: true,
            description: true,
          },
        },
      },
    });
    this.reload.scheduleReload(tenantId);
    return rule;
  }

  async deleteForwardingRule(tenantId: string, id: string) {
    await this.assertForwardingRuleBelongs(tenantId, id);
    await this.prisma.asteriskForwardingRules.delete({ where: { id } });
    this.reload.scheduleReload(tenantId);
  }

  private async validateForwardingRule(
    tenantId: string,
    dto: { didId: string; forwardType: string; targetValue: string },
    currentRuleId?: string,
  ) {
    const did = await this.prisma.asteriskDid.findFirst({
      where: { tenantId, id: dto.didId },
      select: { id: true },
    });
    if (!did) throw new BadRequestException(`DID "${dto.didId}" not found`);

    const existing = await this.prisma.asteriskForwardingRules.findFirst({
      where: {
        tenantId,
        didId: dto.didId,
        ...(currentRuleId ? { NOT: { id: currentRuleId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('A forwarding rule already exists for this DID');
    }

    if (dto.forwardType === 'QUEUE') {
      const queue = await this.prisma.queues.findFirst({
        where: { tenantId, queueName: dto.targetValue, isActive: true },
        select: { queueId: true },
      });
      if (!queue) throw new BadRequestException(`Queue "${dto.targetValue}" not found`);
      return;
    }

    if (dto.forwardType === 'EXTENSION') {
      const agent = await this.prisma.agents.findFirst({
        where: { tenantId, extension: dto.targetValue, isActive: true },
        select: { agentId: true },
      });
      if (!agent) throw new BadRequestException(`Extension "${dto.targetValue}" not found`);
      return;
    }

    throw new BadRequestException(`Unsupported forwardType "${dto.forwardType}"`);
  }

  private async assertForwardingRuleBelongs(tenantId: string, id: string) {
    const rule = await this.prisma.asteriskForwardingRules.findFirst({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException(`Forwarding rule ${id} not found`);
  }

  // ─── Prompts ───────────────────────────────────────────────────────────────

  getPrompts(tenantId: string) {
    return this.prisma.asteriskPrompt.findMany({
      where: { tenantId },
      orderBy: [{ category: 'asc' }, { displayName: 'asc' }],
    });
  }

  async createPrompt(tenantId: string, dto: CreatePromptDto) {
    return this.prisma.asteriskPrompt.create({
      data: {
        tenantId,
        promptKey: dto.promptKey,
        displayName: dto.displayName,
        fileName: dto.fileName,
        category: dto.category ?? 'ivr',
        description: dto.description,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updatePrompt(tenantId: string, id: string, dto: UpdatePromptDto) {
    const prompt = await this.assertPromptBelongs(tenantId, id);

    if (!dto.isActive) {
      await this.assertPromptNotInUse(tenantId, prompt.promptKey, '비활성화');
    }

    if (dto.promptKey !== prompt.promptKey) {
      await this.prisma.$transaction(async (tx) => {
        await tx.asteriskPrompt.update({
          where: { id },
          data: {
            promptKey: dto.promptKey,
            displayName: dto.displayName,
            fileName: dto.fileName,
            category: dto.category ?? 'ivr',
            description: dto.description,
            isActive: dto.isActive ?? true,
          },
        });
        await tx.asteriskIvrMenu.updateMany({
          where: { tenantId, welcomePrompt: prompt.promptKey },
          data: { welcomePrompt: dto.promptKey },
        });
        await tx.asteriskIvrMenu.updateMany({
          where: { tenantId, menuPrompt: prompt.promptKey },
          data: { menuPrompt: dto.promptKey },
        });
      });
      this.reload.scheduleReload(tenantId);
      return this.prisma.asteriskPrompt.findUnique({ where: { id } });
    }

    return this.prisma.asteriskPrompt.update({
      where: { id },
      data: {
        displayName: dto.displayName,
        fileName: dto.fileName,
        category: dto.category ?? 'ivr',
        description: dto.description,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async deletePrompt(tenantId: string, id: string) {
    const prompt = await this.assertPromptBelongs(tenantId, id);
    await this.assertPromptNotInUse(tenantId, prompt.promptKey, '삭제');
    await this.prisma.asteriskPrompt.delete({ where: { id } });
  }

  private async assertPromptBelongs(tenantId: string, id: string) {
    const prompt = await this.prisma.asteriskPrompt.findFirst({ where: { id, tenantId } });
    if (!prompt) throw new NotFoundException(`Prompt ${id} not found`);
    return prompt;
  }

  private async assertPromptNotInUse(tenantId: string, promptKey: string, action: string) {
    const inUse = await this.prisma.asteriskIvrMenu.findFirst({
      where: {
        tenantId,
        OR: [
          { welcomePrompt: promptKey },
          { menuPrompt: promptKey },
        ],
      },
      select: { id: true, name: true },
    });
    if (inUse) {
      throw new BadRequestException(`Prompt "${promptKey}" is used by IVR menu "${inUse.name}" and cannot be ${action}.`);
    }
  }

  // ─── 080 Blocklist ────────────────────────────────────────────────────────

  getBlocklistEntries(tenantId: string) {
    return this.prisma.asteriskBlocklistEntry.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createBlocklistEntry(tenantId: string, dto: CreateBlocklistEntryDto) {
    const phoneNumber = this.normalizePhoneNumber(dto.phoneNumber);
    const entry = await this.prisma.asteriskBlocklistEntry.create({
      data: {
        tenantId,
        phoneNumber,
        description: dto.description,
        isActive: dto.isActive ?? true,
      },
    });
    this.reload.scheduleReload(tenantId);
    return entry;
  }

  async updateBlocklistEntry(tenantId: string, id: string, dto: UpdateBlocklistEntryDto) {
    await this.assertBlocklistEntryBelongs(tenantId, id);
    const entry = await this.prisma.asteriskBlocklistEntry.update({
      where: { id },
      data: {
        phoneNumber: this.normalizePhoneNumber(dto.phoneNumber),
        description: dto.description,
        isActive: dto.isActive ?? true,
      },
    });
    this.reload.scheduleReload(tenantId);
    return entry;
  }

  async deleteBlocklistEntry(tenantId: string, id: string) {
    await this.assertBlocklistEntryBelongs(tenantId, id);
    await this.prisma.asteriskBlocklistEntry.delete({ where: { id } });
    this.reload.scheduleReload(tenantId);
  }

  private normalizePhoneNumber(phoneNumber: string) {
    const normalized = phoneNumber.replace(/\D/g, '');
    if (!/^\d{8,16}$/.test(normalized)) {
      throw new BadRequestException('phoneNumber must contain 8 to 16 digits');
    }
    return normalized;
  }

  private async assertBlocklistEntryBelongs(tenantId: string, id: string) {
    const entry = await this.prisma.asteriskBlocklistEntry.findFirst({ where: { id, tenantId } });
    if (!entry) throw new NotFoundException(`Blocklist entry ${id} not found`);
  }
}
