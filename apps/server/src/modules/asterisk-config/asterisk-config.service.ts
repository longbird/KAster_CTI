import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma.service';
import { AmiConnectionService } from '../ami/ami-connection.service';
import { ParsedAmiFrame } from '../ami/ami.parser';
import { AsteriskReloadService } from './asterisk-reload.service';
import {
  DEFAULT_DISTRIBUTION_RULE_DISPLAY_NAME,
  DEFAULT_DISTRIBUTION_RULE_QUEUE_NAME,
} from '../../common/call-routing.constants';
import { CreateBlocklistEntryDto, ImportBlocklistEntryRowDto, UpdateBlocklistEntryDto } from './dto/blocklist-entry.dto';
import { CreateDidDto, UpdateDidDto } from './dto/did.dto';
import { CreateForwardingRuleDto, UpdateForwardingRuleDto } from './dto/forwarding-rule.dto';
import { CreateIvrMenuDto, UpdateIvrMenuDto } from './dto/ivr-menu.dto';
import { CreatePromptDto, UpdatePromptDto } from './dto/prompt.dto';
import { CreateBulkTrunksDto, CreateTrunkDto, UpdateTrunkDto } from './dto/trunk.dto';

const FORWARDING_CONDITION_TYPES = new Set(['ALWAYS', 'TIME_RANGE']);
const FORWARDING_TYPES = new Set(['EXTENSION', 'QUEUE', 'EXTERNAL_NUMBER']);
const FORWARDING_TRIGGER_MODES = new Set(['IMMEDIATE', 'AFTER_QUEUE_WAIT', 'SMART_NO_READY']);
const BLOCKLIST_MATCH_TYPES = new Set(['EXACT', 'PREFIX']);
const WEEKDAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const WEEKDAY_SET = new Set(WEEKDAY_ORDER);
const TIME_TEXT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const PROMPT_AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.gsm', '.ulaw', '.alaw']);

interface ParsedWavAudio {
  formatTag: number;
  data: Buffer;
}

const MU_LAW_BIAS = 0x84;
const PCM_CLIP = 32635;
const SEG_END = [0x1f, 0x3f, 0x7f, 0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff];

export interface NormalizedForwardingSchedule {
  conditionType: 'ALWAYS' | 'TIME_RANGE';
  timeStart: string | null;
  timeEnd: string | null;
  daysOfWeek: string[];
}

interface NormalizedForwardingRule {
  didId: string;
  forwardType: string;
  targetValue: string;
  forwardTriggerMode: 'IMMEDIATE' | 'AFTER_QUEUE_WAIT' | 'SMART_NO_READY';
  queueWaitSeconds: number | null;
  stickyCallbackWindowMinutes: number | null;
  conditionType: string;
  timeStart: string | null;
  timeEnd: string | null;
  daysOfWeek: string | null;
  scheduleJson: string | null;
  description: string | null;
  enabled: boolean;
}

type ForwardingRuleBase = {
  forwardTriggerMode?: string | null;
  queueWaitSeconds?: number | null;
  stickyCallbackWindowMinutes?: number | null;
  daysOfWeek: string | null;
  timeStart: string | null;
  timeEnd: string | null;
  conditionType: string;
  scheduleJson?: string | null;
};

export type ForwardingRuleView<T extends ForwardingRuleBase = ForwardingRuleBase> = Omit<
  T,
  'daysOfWeek' | 'timeStart' | 'timeEnd' | 'conditionType'
> & {
  conditionType: 'ALWAYS' | 'TIME_RANGE';
  timeStart: string | null;
  timeEnd: string | null;
  daysOfWeek: string[];
  schedules: NormalizedForwardingSchedule[];
};

interface UploadedPromptAudioFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

interface PromptAudioFile {
  filePath: string;
  fileName: string;
  contentType: string;
}

function parseWavAudio(buffer: Buffer): ParsedWavAudio | null {
  if (buffer.length < 44) {
    return null;
  }

  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }

  let formatTag: number | null = null;
  let data: Buffer | null = null;
  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;

    if (chunkEnd > buffer.length) {
      break;
    }

    if (chunkId === 'fmt ' && chunkSize >= 2) {
      formatTag = buffer.readUInt16LE(chunkStart);
    } else if (chunkId === 'data') {
      data = buffer.subarray(chunkStart, chunkEnd);
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (formatTag === null || !data) {
    return null;
  }

  return { formatTag, data };
}

function searchSegment(value: number): number {
  for (let index = 0; index < SEG_END.length; index += 1) {
    if (value <= SEG_END[index]) {
      return index;
    }
  }
  return SEG_END.length;
}

function muLawByteToLinearSample(value: number): number {
  const uVal = (~value) & 0xff;
  let sample = ((uVal & 0x0f) << 3) + MU_LAW_BIAS;
  sample <<= (uVal & 0x70) >> 4;
  return (uVal & 0x80) ? (MU_LAW_BIAS - sample) : (sample - MU_LAW_BIAS);
}

function aLawByteToLinearSample(value: number): number {
  const aVal = (value ^ 0x55) & 0xff;
  let sample = (aVal & 0x0f) << 4;
  const segment = (aVal & 0x70) >> 4;

  switch (segment) {
    case 0:
      sample += 8;
      break;
    case 1:
      sample += 0x108;
      break;
    default:
      sample += 0x108;
      sample <<= segment - 1;
      break;
  }

  return (aVal & 0x80) ? sample : -sample;
}

function linearSampleToMuLaw(sample: number): number {
  let pcm = sample;
  let mask = 0xff;

  if (pcm < 0) {
    pcm = -pcm;
    mask = 0x7f;
  }

  if (pcm > PCM_CLIP) {
    pcm = PCM_CLIP;
  }

  pcm += MU_LAW_BIAS;
  const segment = searchSegment(pcm >> 7);
  if (segment >= 8) {
    return 0x7f ^ mask;
  }

  const mantissa = (pcm >> (segment + 3)) & 0x0f;
  return ((segment << 4) | mantissa) ^ mask;
}

function linearSampleToALaw(sample: number): number {
  let pcm = sample;
  let mask = 0xd5;

  if (pcm < 0) {
    pcm = -pcm - 1;
    mask = 0x55;
  }

  if (pcm > PCM_CLIP) {
    pcm = PCM_CLIP;
  }

  if (pcm >= 256) {
    const segment = searchSegment(pcm >> 4);
    if (segment >= 8) {
      return 0x7f ^ mask;
    }
    const mantissa = (pcm >> (segment + 3)) & 0x0f;
    return (((segment << 4) | mantissa) ^ mask) & 0xff;
  }

  return ((pcm >> 4) ^ mask) & 0xff;
}

function convertLawPayload(
  payload: Buffer,
  from: 'ulaw' | 'alaw',
  to: 'ulaw' | 'alaw',
): Buffer {
  if (from === to) {
    return Buffer.from(payload);
  }

  const output = Buffer.allocUnsafe(payload.length);

  for (let index = 0; index < payload.length; index += 1) {
    const linear = from === 'ulaw'
      ? muLawByteToLinearSample(payload[index])
      : aLawByteToLinearSample(payload[index]);
    output[index] = to === 'ulaw'
      ? linearSampleToMuLaw(linear)
      : linearSampleToALaw(linear);
  }

  return output;
}

@Injectable()
export class AsteriskConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reload: AsteriskReloadService,
    private readonly ami: AmiConnectionService,
    private readonly config: ConfigService,
  ) {}

  // ─── Trunks ────────────────────────────────────────────────────────────────

  async getTrunks(tenantId: string) {
    const trunks = await this.prisma.asteriskTrunk.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
    return trunks.map((trunk) => this.withComputedDisplayNumber(trunk));
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
    return this.withComputedDisplayNumber(trunk);
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
        displayNumber: dto.displayNumber,
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
    return created.map((trunk) => this.withComputedDisplayNumber(trunk));
  }

  /** Full-replace PUT — all fields must be provided. */
  async updateTrunk(tenantId: string, id: string, dto: UpdateTrunkDto) {
    await this.assertTrunkBelongs(tenantId, id);
    const trunk = await this.prisma.asteriskTrunk.update({
      where: { id },
      data: this.normalizeTrunkInput(dto),
    });
    this.reload.scheduleReload(tenantId);
    return this.withComputedDisplayNumber(trunk);
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
      displayNumber: this.normalizeDisplayNumber(dto.displayNumber),
      codecs: dto.codecs ?? 'alaw,ulaw',
      enabled: dto.enabled ?? true,
    };
  }

  private normalizeDisplayNumber(value?: string | null) {
    const normalized = value?.replace(/\D/g, '') ?? '';
    if (normalized && (normalized.length < 2 || normalized.length > 16)) {
      throw new BadRequestException('displayNumber must be 2-16 digits');
    }
    return normalized || null;
  }

  private computeTrunkDisplayNumber(trunk: { displayNumber?: string | null; username?: string | null; name?: string | null }) {
    if (trunk.displayNumber?.trim()) return trunk.displayNumber.trim();
    const candidate = [trunk.username, trunk.name]
      .map((value) => value?.replace(/\D/g, '') ?? '')
      .find((value) => value.length >= 4);
    return candidate ? candidate.slice(-4) : null;
  }

  private withComputedDisplayNumber<T extends { displayNumber?: string | null; username?: string | null; name?: string | null }>(trunk: T) {
    return {
      ...trunk,
      computedDisplayNumber: this.computeTrunkDisplayNumber(trunk),
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
    this.reload.scheduleReload(tenantId);
    return this.prisma.agents.findFirst({ where: { agentId, tenantId } });
  }

  async syncAgentSip(tenantId: string) {
    await this.reload.executeReload(tenantId);
  }

  // ─── Forwarding Rules ──────────────────────────────────────────────────────

  getForwardingRules(tenantId: string): Promise<ForwardingRuleView[]> {
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
    }).then((rules) => rules.map((rule) => this.mapForwardingRule(rule)));
  }

  async createForwardingRule(
    tenantId: string,
    dto: CreateForwardingRuleDto,
  ): Promise<ForwardingRuleView> {
    const normalized = this.normalizeForwardingRuleInput(dto);
    await this.validateForwardingRule(tenantId, normalized);
    const rule = await this.prisma.asteriskForwardingRules.create({
      data: {
        tenantId,
        didId: normalized.didId,
        forwardType: normalized.forwardType,
        targetValue: normalized.targetValue,
        forwardTriggerMode: normalized.forwardTriggerMode,
        queueWaitSeconds: normalized.queueWaitSeconds,
        stickyCallbackWindowMinutes: normalized.stickyCallbackWindowMinutes,
        conditionType: normalized.conditionType,
        timeStart: normalized.timeStart,
        timeEnd: normalized.timeEnd,
        daysOfWeek: normalized.daysOfWeek,
        scheduleJson: normalized.scheduleJson,
        description: normalized.description,
        enabled: normalized.enabled,
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
    return this.mapForwardingRule(rule);
  }

  async updateForwardingRule(
    tenantId: string,
    id: string,
    dto: UpdateForwardingRuleDto,
  ): Promise<ForwardingRuleView> {
    await this.assertForwardingRuleBelongs(tenantId, id);
    const normalized = this.normalizeForwardingRuleInput(dto);
    await this.validateForwardingRule(tenantId, normalized, id);
    const rule = await this.prisma.asteriskForwardingRules.update({
      where: { id },
      data: {
        didId: normalized.didId,
        forwardType: normalized.forwardType,
        targetValue: normalized.targetValue,
        forwardTriggerMode: normalized.forwardTriggerMode,
        queueWaitSeconds: normalized.queueWaitSeconds,
        stickyCallbackWindowMinutes: normalized.stickyCallbackWindowMinutes,
        conditionType: normalized.conditionType,
        timeStart: normalized.timeStart,
        timeEnd: normalized.timeEnd,
        daysOfWeek: normalized.daysOfWeek,
        scheduleJson: normalized.scheduleJson,
        description: normalized.description,
        enabled: normalized.enabled,
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
    return this.mapForwardingRule(rule);
  }

  async deleteForwardingRule(tenantId: string, id: string) {
    await this.assertForwardingRuleBelongs(tenantId, id);
    await this.prisma.asteriskForwardingRules.delete({ where: { id } });
    this.reload.scheduleReload(tenantId);
  }

  private async validateForwardingRule(
    tenantId: string,
    dto: NormalizedForwardingRule,
    currentRuleId?: string,
  ) {
    const did = await this.prisma.asteriskDid.findFirst({
      where: { tenantId, id: dto.didId },
      select: { id: true, directQueue: true, ivrMenuId: true },
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
    } else if (dto.forwardType === 'EXTENSION') {
      const agent = await this.prisma.agents.findFirst({
        where: { tenantId, extension: dto.targetValue, isActive: true },
        select: { agentId: true },
      });
      if (!agent) throw new BadRequestException(`Extension "${dto.targetValue}" not found`);
    } else if (dto.forwardType === 'EXTERNAL_NUMBER') {
      if (!/^\d{8,16}$/.test(dto.targetValue)) {
        throw new BadRequestException('External forwarding number must contain 8 to 16 digits');
      }
    } else {
      throw new BadRequestException(`Unsupported forwardType "${dto.forwardType}"`);
    }

    if (!FORWARDING_TRIGGER_MODES.has(dto.forwardTriggerMode)) {
      throw new BadRequestException(`Unsupported forwardTriggerMode "${dto.forwardTriggerMode}"`);
    }

    if (dto.forwardTriggerMode === 'AFTER_QUEUE_WAIT' || dto.forwardTriggerMode === 'SMART_NO_READY') {
      if (!did.directQueue) {
        throw new BadRequestException('Queue-based forwarding conditions require the DID to use a direct queue');
      }
      if (dto.forwardType === 'QUEUE' && dto.targetValue === did.directQueue) {
        throw new BadRequestException('Queue-based forwarding cannot target the same queue as the DID default queue');
      }
    }

    if (dto.forwardTriggerMode === 'AFTER_QUEUE_WAIT' && !dto.queueWaitSeconds) {
      throw new BadRequestException('queueWaitSeconds is required for AFTER_QUEUE_WAIT');
    }
  }

  private normalizeForwardingRuleInput(dto: CreateForwardingRuleDto | UpdateForwardingRuleDto) {
    if (!FORWARDING_TYPES.has(dto.forwardType)) {
      throw new BadRequestException(`Unsupported forwardType "${dto.forwardType}"`);
    }

    const forwardTriggerMode =
      dto.forwardTriggerMode === 'AFTER_QUEUE_WAIT' || dto.forwardTriggerMode === 'SMART_NO_READY'
        ? dto.forwardTriggerMode
        : 'IMMEDIATE';

    const targetValue =
      dto.forwardType === 'EXTERNAL_NUMBER'
        ? dto.targetValue.replace(/\D/g, '')
        : dto.targetValue.trim();

    const schedules = this.normalizeForwardingSchedules(dto);
    const primarySchedule = schedules.length === 1 ? schedules[0] : null;

    return {
      didId: dto.didId,
      forwardType: dto.forwardType,
      targetValue,
      forwardTriggerMode,
      queueWaitSeconds:
        forwardTriggerMode === 'AFTER_QUEUE_WAIT'
          ? dto.queueWaitSeconds ?? null
          : null,
      stickyCallbackWindowMinutes: dto.stickyCallbackWindowMinutes ?? null,
      conditionType: primarySchedule?.conditionType ?? 'TIME_RANGE',
      timeStart: primarySchedule?.conditionType === 'TIME_RANGE' ? primarySchedule.timeStart : null,
      timeEnd: primarySchedule?.conditionType === 'TIME_RANGE' ? primarySchedule.timeEnd : null,
      daysOfWeek:
        primarySchedule?.conditionType === 'TIME_RANGE'
          ? primarySchedule.daysOfWeek.join(',')
          : null,
      scheduleJson: JSON.stringify(schedules),
      description: dto.description?.trim() || null,
      enabled: dto.enabled ?? true,
    } satisfies NormalizedForwardingRule;
  }

  private normalizeWeekdays(daysOfWeek?: string[]) {
    const deduped = [...new Set((daysOfWeek ?? []).map((value) => value.trim().toLowerCase()))];
    const invalid = deduped.filter((value) => !WEEKDAY_SET.has(value as (typeof WEEKDAY_ORDER)[number]));
    if (invalid.length > 0) {
      throw new BadRequestException(`Unsupported weekday(s): ${invalid.join(', ')}`);
    }
    return WEEKDAY_ORDER.filter((day) => deduped.includes(day));
  }

  private normalizeForwardingSchedules(
    dto: CreateForwardingRuleDto | UpdateForwardingRuleDto,
  ): NormalizedForwardingSchedule[] {
    const schedules =
      dto.schedules && dto.schedules.length > 0
        ? dto.schedules
        : [
            {
              conditionType: dto.conditionType ?? 'ALWAYS',
              timeStart: dto.timeStart,
              timeEnd: dto.timeEnd,
              daysOfWeek: dto.daysOfWeek ?? [],
            },
          ];

    const normalized = schedules.map((schedule) => {
      const conditionType = schedule.conditionType ?? 'ALWAYS';
      if (!FORWARDING_CONDITION_TYPES.has(conditionType)) {
        throw new BadRequestException(`Unsupported conditionType "${conditionType}"`);
      }

      if (conditionType === 'ALWAYS') {
        return {
          conditionType: 'ALWAYS' as const,
          timeStart: null,
          timeEnd: null,
          daysOfWeek: [],
        };
      }

      const timeStart = schedule.timeStart?.trim() ?? null;
      const timeEnd = schedule.timeEnd?.trim() ?? null;
      const daysOfWeek = this.normalizeWeekdays(schedule.daysOfWeek);

      if (!timeStart || !timeEnd || daysOfWeek.length === 0) {
        throw new BadRequestException('timeStart, timeEnd, and daysOfWeek are required for TIME_RANGE');
      }
      if (!TIME_TEXT_PATTERN.test(timeStart)) {
        throw new BadRequestException('timeStart must be in HH:mm format');
      }
      if (!TIME_TEXT_PATTERN.test(timeEnd)) {
        throw new BadRequestException('timeEnd must be in HH:mm format');
      }
      if (timeStart === timeEnd) {
        throw new BadRequestException('timeStart and timeEnd must not be identical');
      }

      return {
        conditionType: 'TIME_RANGE' as const,
        timeStart,
        timeEnd,
        daysOfWeek,
      };
    });

    if (normalized.some((item) => item.conditionType === 'ALWAYS') && normalized.length > 1) {
      throw new BadRequestException('ALWAYS condition cannot be combined with other schedules');
    }

    return normalized;
  }

  private parseForwardingSchedules(rule: {
    conditionType: string;
    timeStart: string | null;
    timeEnd: string | null;
    daysOfWeek: string | null;
    scheduleJson?: string | null;
  }): NormalizedForwardingSchedule[] {
    if (rule.scheduleJson) {
      try {
        const parsed = JSON.parse(rule.scheduleJson) as Array<{
          conditionType: string;
          timeStart?: string | null;
          timeEnd?: string | null;
          daysOfWeek?: string[];
        }>;

        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => {
              if (item.conditionType === 'ALWAYS') {
                return {
                  conditionType: 'ALWAYS' as const,
                  timeStart: null,
                  timeEnd: null,
                  daysOfWeek: [],
                };
              }
              const days = this.normalizeWeekdays(item.daysOfWeek);
              return {
                conditionType: 'TIME_RANGE' as const,
                timeStart: item.timeStart ?? null,
                timeEnd: item.timeEnd ?? null,
                daysOfWeek: days,
              };
            })
            .filter((item) => item.conditionType === 'ALWAYS' || (item.timeStart && item.timeEnd && item.daysOfWeek.length > 0));
        }
      } catch {
        // fall through to legacy fields
      }
    }

    if (rule.conditionType === 'TIME_RANGE' && rule.timeStart && rule.timeEnd && rule.daysOfWeek) {
      return [
        {
          conditionType: 'TIME_RANGE',
          timeStart: rule.timeStart,
          timeEnd: rule.timeEnd,
          daysOfWeek: rule.daysOfWeek.split(',').filter(Boolean),
        },
      ];
    }

    return [
      {
        conditionType: 'ALWAYS',
        timeStart: null,
        timeEnd: null,
        daysOfWeek: [],
      },
    ];
  }

  private mapForwardingRule<T extends ForwardingRuleBase>(rule: T): ForwardingRuleView<T> {
    const schedules = this.parseForwardingSchedules(rule);
    const primary = schedules[0];
    return {
      ...rule,
      forwardTriggerMode:
        rule.forwardTriggerMode === 'AFTER_QUEUE_WAIT' || rule.forwardTriggerMode === 'SMART_NO_READY'
          ? rule.forwardTriggerMode
          : 'IMMEDIATE',
      queueWaitSeconds: rule.queueWaitSeconds ?? null,
      stickyCallbackWindowMinutes: rule.stickyCallbackWindowMinutes ?? null,
      conditionType: primary?.conditionType ?? 'ALWAYS',
      timeStart: primary?.conditionType === 'TIME_RANGE' ? primary.timeStart : null,
      timeEnd: primary?.conditionType === 'TIME_RANGE' ? primary.timeEnd : null,
      daysOfWeek: primary?.conditionType === 'TIME_RANGE' ? primary.daysOfWeek : [],
      schedules,
    };
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

  async getPromptAudioFile(tenantId: string, id: string): Promise<PromptAudioFile> {
    const prompt = await this.assertPromptBelongs(tenantId, id);
    const fileName = path.basename(prompt.fileName);

    if (!fileName || fileName !== prompt.fileName) {
      throw new BadRequestException('Invalid prompt file name.');
    }

    const candidates = this.resolvePromptTargetDirs(this.resolvePromptSoundsDir())
      .map((dir) => path.join(dir, fileName));
    const filePath = candidates.find((candidate) => {
      try {
        return fs.statSync(candidate).isFile();
      } catch {
        return false;
      }
    });

    if (!filePath) {
      throw new NotFoundException(`Prompt audio file "${fileName}" not found`);
    }

    return {
      filePath,
      fileName,
      contentType: this.getPromptAudioContentType(fileName),
    };
  }

  async createPrompt(tenantId: string, dto: CreatePromptDto) {
    return this.prisma.asteriskPrompt.create({
      data: {
        tenantId,
        promptKey: dto.promptKey.trim(),
        displayName: dto.displayName.trim(),
        fileName: dto.fileName.trim(),
        category: dto.category?.trim() || 'ivr',
        description: dto.description?.trim() || null,
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
            promptKey: dto.promptKey.trim(),
            displayName: dto.displayName.trim(),
            fileName: dto.fileName.trim(),
            category: dto.category?.trim() || 'ivr',
            description: dto.description?.trim() || null,
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
        displayName: dto.displayName.trim(),
        fileName: dto.fileName.trim(),
        category: dto.category?.trim() || 'ivr',
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async uploadPromptAudio(tenantId: string, file?: UploadedPromptAudioFile) {
    if (!file) {
      throw new BadRequestException('업로드할 음성 파일이 없습니다.');
    }

    const originalExt = path.extname(file.originalname || '').toLowerCase();
    if (!PROMPT_AUDIO_EXTENSIONS.has(originalExt)) {
      throw new BadRequestException('wav, mp3, gsm, ulaw, alaw 파일만 업로드할 수 있습니다.');
    }

    const soundsDir = this.resolvePromptSoundsDir();
    if (!fs.existsSync(soundsDir)) {
      throw new InternalServerErrorException(`Asterisk sounds directory "${soundsDir}" does not exist.`);
    }

    const rawBaseName = path.basename(file.originalname, originalExt);
    const safeBaseName = rawBaseName
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();

    if (!safeBaseName) {
      throw new BadRequestException('파일명에서 사용할 수 있는 영문/숫자 이름이 없습니다.');
    }

    const storedFileName = `${safeBaseName}${originalExt}`;
    for (const targetDir of this.resolvePromptTargetDirs(soundsDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      const targetPath = path.join(targetDir, storedFileName);
      fs.writeFileSync(targetPath, file.buffer);
      this.writePromptPlaybackArtifacts(targetDir, safeBaseName, originalExt, file.buffer);
    }

    return {
      fileName: storedFileName,
      promptKey: `custom/${safeBaseName}`,
      bytes: file.size,
    };
  }

  private resolvePromptSoundsDir() {
    const configured = this.config.get<string>('ASTERISK_SOUNDS_DIR', '/var/lib/asterisk/sounds/custom');
    if (!path.isAbsolute(configured)) {
      throw new InternalServerErrorException(`ASTERISK_SOUNDS_DIR must be an absolute path, got "${configured}"`);
    }
    return configured;
  }

  private resolvePromptTargetDirs(soundsDir: string) {
    const rootSoundsDir = path.dirname(soundsDir);
    const customDirName = path.basename(soundsDir);
    const languageCustomDir = path.join(rootSoundsDir, 'en', customDirName);
    return [...new Set([soundsDir, languageCustomDir])];
  }

  private getPromptAudioContentType(fileName: string) {
    switch (path.extname(fileName).toLowerCase()) {
      case '.mp3':
        return 'audio/mpeg';
      case '.wav':
        return 'audio/wav';
      case '.ulaw':
        return 'audio/basic';
      case '.alaw':
      case '.gsm':
        return 'application/octet-stream';
      default:
        return 'application/octet-stream';
    }
  }

  private writePromptPlaybackArtifacts(
    soundsDir: string,
    safeBaseName: string,
    originalExt: string,
    buffer: Buffer,
  ) {
    const ulawPath = path.join(soundsDir, `${safeBaseName}.ulaw`);
    const alawPath = path.join(soundsDir, `${safeBaseName}.alaw`);

    if (originalExt !== '.ulaw' && fs.existsSync(ulawPath)) {
      fs.rmSync(ulawPath);
    }
    if (originalExt !== '.alaw' && fs.existsSync(alawPath)) {
      fs.rmSync(alawPath);
    }

    if (originalExt === '.ulaw') {
      fs.writeFileSync(alawPath, convertLawPayload(buffer, 'ulaw', 'alaw'));
      return;
    }

    if (originalExt === '.alaw') {
      fs.writeFileSync(ulawPath, convertLawPayload(buffer, 'alaw', 'ulaw'));
      return;
    }

    if (originalExt !== '.wav') {
      return;
    }

    const parsed = parseWavAudio(buffer);
    if (!parsed) {
      return;
    }

    if (parsed.formatTag === 7) {
      fs.writeFileSync(ulawPath, parsed.data);
      fs.writeFileSync(alawPath, convertLawPayload(parsed.data, 'ulaw', 'alaw'));
      return;
    }

    if (parsed.formatTag === 6) {
      fs.writeFileSync(alawPath, parsed.data);
      fs.writeFileSync(ulawPath, convertLawPayload(parsed.data, 'alaw', 'ulaw'));
    }
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
    const matchType = this.normalizeBlocklistMatchType(dto.matchType);
    const phoneNumber = this.normalizePhoneNumber(dto.phoneNumber, matchType);
    const branchId = await this.normalizeBlocklistBranchId(tenantId, dto.branchId);
    const entry = await this.prisma.asteriskBlocklistEntry.create({
      data: {
        tenantId,
        matchType,
        phoneNumber,
        branchId,
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    });
    this.reload.scheduleReload(tenantId);
    return entry;
  }

  async importBlocklistEntries(tenantId: string, rows: ImportBlocklistEntryRowDto[]) {
    const summary = { successCount: 0, skippedCount: 0, failedCount: 0 };
    const failures: Array<{ rowNumber: number; reason: string }> = [];

    for (const [index, row] of rows.entries()) {
      try {
        await this.prisma.asteriskBlocklistEntry.create({
          data: {
            tenantId,
            matchType: 'EXACT',
            phoneNumber: this.normalizePhoneNumber(row.전화번호, 'EXACT'),
            description: row.사유?.trim() || null,
            isActive: true,
          },
        });
        summary.successCount += 1;
      } catch (error: any) {
        if (error?.code === 'P2002') {
          summary.skippedCount += 1;
          continue;
        }

        summary.failedCount += 1;
        failures.push({
          rowNumber: index + 1,
          reason: error?.message ?? '알 수 없는 오류',
        });
      }
    }

    if (summary.successCount > 0) {
      this.reload.scheduleReload(tenantId);
    }

    return { success: true, data: { summary, failures }, error: null };
  }

  async updateBlocklistEntry(tenantId: string, id: string, dto: UpdateBlocklistEntryDto) {
    await this.assertBlocklistEntryBelongs(tenantId, id);
    const matchType = this.normalizeBlocklistMatchType(dto.matchType);
    const branchId = await this.normalizeBlocklistBranchId(tenantId, dto.branchId);
    const entry = await this.prisma.asteriskBlocklistEntry.update({
      where: { id },
      data: {
        matchType,
        phoneNumber: this.normalizePhoneNumber(dto.phoneNumber, matchType),
        branchId,
        description: dto.description?.trim() || null,
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

  private normalizeBlocklistMatchType(matchType?: string) {
    const normalized = matchType ?? 'EXACT';
    if (!BLOCKLIST_MATCH_TYPES.has(normalized)) {
      throw new BadRequestException(`Unsupported matchType "${normalized}"`);
    }
    return normalized;
  }

  private normalizePhoneNumber(phoneNumber: string | number, matchType: string) {
    const normalized = String(phoneNumber ?? '').replace(/\D/g, '');
    const isValid =
      matchType === 'PREFIX' ? /^\d{2,16}$/.test(normalized) : /^\d{8,16}$/.test(normalized);
    if (!isValid) {
      throw new BadRequestException(
        matchType === 'PREFIX'
          ? 'phoneNumber must contain 2 to 16 digits for PREFIX matching'
          : 'phoneNumber must contain 8 to 16 digits for EXACT matching',
      );
    }
    return normalized;
  }

  private async normalizeBlocklistBranchId(tenantId: string, branchId?: string | null) {
    const normalized = branchId?.trim() || null;
    if (!normalized) {
      return null;
    }

    const branch = await this.prisma.branches.findFirst({
      where: { tenantId, branchId: normalized },
      select: { branchId: true },
    });
    if (!branch) {
      throw new BadRequestException('지사 정보를 찾을 수 없습니다.');
    }
    return normalized;
  }

  private async assertBlocklistEntryBelongs(tenantId: string, id: string) {
    const entry = await this.prisma.asteriskBlocklistEntry.findFirst({ where: { id, tenantId } });
    if (!entry) throw new NotFoundException(`Blocklist entry ${id} not found`);
  }
}
