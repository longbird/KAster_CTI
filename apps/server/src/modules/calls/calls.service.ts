import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { createReadStream, promises as fs } from 'node:fs';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import { Prisma } from '@prisma/client';
import { buildAcceptedCommand, CommandMetaInput, normalizeCommandMeta } from '../../common/command-meta.util';
import { normalizeCallerId, parseAllowedCallerIds } from '../../common/outbound-caller-id.util';
import {
  assertOutboundDialAllowed,
  classifyOutboundDialNumber,
  extractOutboundDialPermissions,
  normalizeAllowedOutboundDialNumber,
  OutboundDialPermissions,
} from '../../common/outbound-dial-policy.util';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EventBusService } from '../events/event-bus.service';
import { AsteriskManagerService } from './asterisk-manager.service';
import { SessionEngineService } from './session-engine.service';
import { CreateMemoDto } from './dto/create-memo.dto';
import { ClientOriginateCommandDto } from './dto/client-originate-command.dto';
import { InternalOriginateDto } from './dto/internal-originate.dto';
import { ListCallsQueryDto } from './dto/list-calls-query.dto';
import { MuteCallDto } from './dto/mute-call.dto';
import { OriginateDto } from './dto/originate.dto';
import { TransferDto } from './dto/transfer.dto';
import { TransferDetectorService } from './transfer-detector.service';
import { normalizePhone } from '../customers/customers.service';
import { REALTIME_EVENTS } from '../realtime/realtime-events';
import { RecordingEncryptionService } from '../recording-pipeline/recording-encryption.service';

const SUPERVISORY_ROLES = new Set(['supervisor', 'admin']);

export interface CallCommandActor {
  agentId: string;
  extension?: string | null;
  role?: string | null;
  outboundDialPermissions?: OutboundDialPermissions;
}

export interface ClientCommandProtocolInput {
  protocol?: string | null;
  timestamp?: string | null;
  nonce?: string | null;
}

const CLIENT_CALL_COMMAND_PROTOCOL = 'kaster-desktop-v1';
const CLIENT_COMMAND_TIMESTAMP_SKEW_MS = 60_000;
const CLIENT_COMMAND_NONCE_TTL_SECONDS = 120;

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventBus: EventBusService,
    private readonly asteriskManager: AsteriskManagerService,
    private readonly transferDetector: TransferDetectorService,
    @Optional() private readonly sessionEngine?: SessionEngineService,
    @Optional() private readonly recordingEncryption?: RecordingEncryptionService,
  ) {}

  private muteStateKey(callId: string) {
    return `kaster:cti:call:${callId}:mute`;
  }

  private isSupervisoryActor(actor?: CallCommandActor | null) {
    return SUPERVISORY_ROLES.has(actor?.role ?? '');
  }

  private async resolveCommandActor(
    tenantId: string,
    actor?: CallCommandActor,
  ): Promise<CallCommandActor | null> {
    if (!actor) return null;

    const agent = await this.prisma.agents.findFirst({
      where: {
        tenantId,
        agentId: actor.agentId,
        isActive: true,
      },
      select: {
        agentId: true,
        extension: true,
        role: true,
        settingsProfile: true,
      },
    });
    if (!agent) {
      throw new ForbiddenException('인증된 상담원 세션을 확인할 수 없습니다.');
    }

    const tokenExtension = actor.extension?.trim();
    if (tokenExtension && tokenExtension !== agent.extension) {
      throw new ForbiddenException('인증 세션의 내선이 현재 상담원 정보와 일치하지 않습니다.');
    }

    return {
      agentId: agent.agentId,
      extension: agent.extension,
      role: agent.role,
      outboundDialPermissions: extractOutboundDialPermissions(agent.settingsProfile),
    };
  }

  private assertClientCommandProtocol(input: ClientCommandProtocolInput) {
    const protocol = input.protocol?.trim();
    if (protocol !== CLIENT_CALL_COMMAND_PROTOCOL) {
      throw new ForbiddenException('허용되지 않은 발신 클라이언트 프로토콜입니다.');
    }

    const timestamp = Number(input.timestamp);
    if (!Number.isFinite(timestamp)) {
      throw new BadRequestException('발신 명령 시간이 필요합니다.');
    }
    if (Math.abs(Date.now() - timestamp) > CLIENT_COMMAND_TIMESTAMP_SKEW_MS) {
      throw new ForbiddenException('발신 명령 시간이 유효하지 않습니다.');
    }

    const nonce = input.nonce?.trim();
    if (!nonce || nonce.length < 16 || nonce.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(nonce)) {
      throw new BadRequestException('발신 명령 nonce 가 유효하지 않습니다.');
    }

    return { protocol, timestamp, nonce };
  }

  private async assertClientCommandNonceUnused(
    tenantId: string,
    agentId: string,
    nonce: string,
  ) {
    const key = `kaster:cti:client-command:nonce:${tenantId}:${agentId}:${nonce}`;
    const result = await this.redis.getClient().set(key, '1', 'EX', CLIENT_COMMAND_NONCE_TTL_SECONDS, 'NX');
    if (result !== 'OK') {
      throw new ForbiddenException('재사용된 발신 명령입니다.');
    }
  }

  private getChannelEndpoint(channelName?: string | null) {
    const channel = channelName?.trim();
    if (!channel) return null;

    const slash = channel.indexOf('/');
    if (slash < 0 || slash === channel.length - 1) return null;

    const endpoint = channel
      .slice(slash + 1)
      .split(/[@;]/, 1)[0]
      ?.replace(/-[0-9a-fA-F]{6,}$/, '')
      .trim();
    return endpoint || null;
  }

  private assertActorCanControlCall(
    call: { primaryAgentId?: string | null },
    agentLeg: { channelName?: string | null } | null | undefined,
    actor: CallCommandActor | null,
  ) {
    if (!actor || this.isSupervisoryActor(actor)) {
      return;
    }

    if (call.primaryAgentId && call.primaryAgentId === actor.agentId) {
      return;
    }

    const actorExtension = actor.extension?.trim();
    const legEndpoint = this.getChannelEndpoint(agentLeg?.channelName);
    if (actorExtension && legEndpoint === actorExtension) {
      return;
    }

    throw new ForbiddenException('본인에게 배정된 통화만 제어할 수 있습니다.');
  }

  private assertTransferTargetAllowed(target: string, actor?: CallCommandActor | null) {
    if (classifyOutboundDialNumber(target) === 'UNSUPPORTED') {
      return;
    }
    assertOutboundDialAllowed(target, actor?.outboundDialPermissions);
  }

  private parseBooleanFilter(value?: string) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  }

  private getMissedReason(row: {
    answeredAt?: Date | null;
    abandonFlag?: boolean | null;
    resultCode?: string | null;
    queueName?: string | null;
    primaryAgent?: unknown | null;
    callMemos?: Array<{ resultCode?: string | null }> | null;
  }) {
    if (row.answeredAt) return null;

    const finalResultCode = row.callMemos?.[0]?.resultCode ?? row.resultCode ?? null;
    if (finalResultCode?.includes('RECOVERY_TIMEOUT')) return 'SYSTEM_RECOVERY';
    if (finalResultCode?.includes('TIMEOUT')) return 'QUEUE_TIMEOUT';
    if (row.abandonFlag) return 'CUSTOMER_ABANDONED';
    if (row.primaryAgent) return 'AGENT_NO_ANSWER';
    if (row.queueName) return 'QUEUE_NO_ANSWER';
    return 'NO_ANSWER';
  }

  private async getMuteStateMap(callIds: string[]) {
    const uniqueCallIds = [...new Set(callIds.filter(Boolean))];
    const muteMap = new Map<string, boolean>();
    if (uniqueCallIds.length === 0) return muteMap;

    const keys = uniqueCallIds.map((callId) => this.muteStateKey(callId));
    const values = await this.redis.getClient().mget(...keys);
    values.forEach((value, index) => {
      muteMap.set(uniqueCallIds[index], value === '1');
    });
    return muteMap;
  }

  private async getRealtimeCustomerMap(
    tenantId: string,
    rows: Array<{ customerId?: string | null; ani?: string | null }>,
  ) {
    const byCustomerId = new Map<string, any>();
    const byPhone = new Map<string, any>();

    const customerIds = [...new Set(
      rows.map((row) => row.customerId).filter((value): value is string => Boolean(value)),
    )];
    if (customerIds.length > 0) {
      const customers = await this.prisma.customers.findMany({
        where: {
          tenantId,
          customerId: { in: customerIds },
        },
        include: {
          phones: {
            where: { isActive: true },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            take: 1,
          },
        },
      });

      const recentCallsByCustomerId = await this.prisma.callSessions.findMany({
        where: {
          tenantId,
          customerId: { in: customerIds },
        },
        orderBy: { startedAt: 'desc' },
        select: {
          customerId: true,
          callId: true,
          direction: true,
          startedAt: true,
          queueName: true,
          sessionStatus: true,
        },
      });

      customers.forEach((customer) => {
        const recentCalls = recentCallsByCustomerId
          .filter((item) => item.customerId === customer.customerId)
          .slice(0, 5)
          .map(({ customerId: _customerId, ...rest }) => rest);
        byCustomerId.set(customer.customerId, {
          customerId: customer.customerId,
          customerName: customer.customerName ?? '미식별 고객',
          grade: customer.grade ?? 'NORMAL',
          phoneNumber: customer.phones[0]?.phoneNumber ?? '',
          companyName: customer.companyName ?? undefined,
          memo: customer.memo ?? undefined,
          lastCalledAt: customer.lastCalledAt?.toISOString() ?? undefined,
          recentCalls,
        });
      });
    }

    const aniNumbers = [...new Set(
      rows
        .map((row) => normalizePhone(row.ani ?? ''))
        .filter(Boolean),
    )];
    if (aniNumbers.length > 0) {
      const phones = await this.prisma.customerPhones.findMany({
        where: {
          normalizedPhone: { in: aniNumbers },
          isActive: true,
          customer: {
            tenantId,
          },
        },
        include: {
          customer: true,
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });

      phones.forEach((phone) => {
        if (!byPhone.has(phone.normalizedPhone)) {
          byPhone.set(phone.normalizedPhone, {
            customerId: phone.customer.customerId,
            customerName: phone.customer.customerName ?? '미식별 고객',
            grade: phone.customer.grade ?? 'NORMAL',
            phoneNumber: phone.phoneNumber,
            companyName: phone.customer.companyName ?? undefined,
            memo: phone.customer.memo ?? undefined,
            lastCalledAt: phone.customer.lastCalledAt?.toISOString() ?? undefined,
            recentCalls: [],
          });
        }
      });
    }

    return rows.map((row) => {
      if (row.customerId && byCustomerId.has(row.customerId)) {
        return byCustomerId.get(row.customerId);
      }
      const normalizedAni = normalizePhone(row.ani ?? '');
      return normalizedAni ? byPhone.get(normalizedAni) ?? null : null;
    });
  }

  private async getBranchScope(tenantId: string, branchId?: string) {
    if (!branchId) return null;

    const [agentMappings, queueMappings] = await Promise.all([
      this.prisma.branchAgents.findMany({
        where: { tenantId, branchId },
        select: { agentId: true },
      }),
      this.prisma.branchQueues.findMany({
        where: { tenantId, branchId },
        select: { queueId: true },
      }),
    ]);

    return {
      agentIds: agentMappings.map((item) => item.agentId),
      queueIds: queueMappings.map((item) => item.queueId),
    };
  }

  private buildBranchCallFilter(scope: { agentIds: string[]; queueIds: string[] } | null): Prisma.callSessionsWhereInput | undefined {
    if (!scope) return undefined;

    return {
      OR: [
        { primaryAgentId: { in: scope.agentIds } },
        { queueId: { in: scope.queueIds } },
      ],
    };
  }

  private async getLatestTransferCandidateMap(tenantId: string, linkedids: string[]) {
    if (linkedids.length === 0) return new Map<string, any>();

    const candidates = await this.prisma.attendedTransferCandidates.findMany({
      where: { tenantId, linkedid: { in: linkedids } },
      orderBy: [{ linkedid: 'asc' }, { requestedAt: 'desc' }],
      select: {
        linkedid: true,
        phase: true,
        toExtension: true,
        requestedAt: true,
        completedAt: true,
        expiredAt: true,
      },
    });

    const latestTransferCandidateMap = new Map<string, any>();
    for (const candidate of candidates) {
      if (!latestTransferCandidateMap.has(candidate.linkedid)) {
        latestTransferCandidateMap.set(candidate.linkedid, candidate);
      }
    }
    return latestTransferCandidateMap;
  }

  private async getDidMetaMap(tenantId: string, didNumbers: Array<string | null | undefined>) {
    const normalized = [...new Set(
      didNumbers
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    )];
    if (normalized.length === 0) return new Map<string, { did: string; representativeNumber: string | null }>();

    const dids = await this.prisma.asteriskDid.findMany({
      where: {
        tenantId,
        did: { in: normalized },
      },
      select: {
        did: true,
        representativeNumber: true,
      },
    } as any) as Array<{ did: string; representativeNumber?: string | null }>;

    return new Map(
      dids.map((row) => [
        row.did,
        {
          did: row.did,
          representativeNumber: row.representativeNumber ?? null,
        },
      ]),
    );
  }

  private normalizeDidCandidate(value: string | null | undefined) {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    const digitCount = trimmed.replace(/\D/g, '').length;
    return digitCount >= 4 ? trimmed : null;
  }

  private async getResolvedDidMap(
    tenantId: string,
    rows: Array<{ linkedid: string; didNumber?: string | null; dnis?: string | null }>,
  ) {
    const resolved = new Map<string, string | null>();
    const missingLinkedids: string[] = [];

    for (const row of rows) {
      const direct = this.normalizeDidCandidate(row.didNumber) ?? this.normalizeDidCandidate(row.dnis);
      if (direct) {
        resolved.set(row.linkedid, direct);
      } else if (row.linkedid) {
        missingLinkedids.push(row.linkedid);
      }
    }

    const uniqueMissingLinkedids = [...new Set(missingLinkedids)];
    if (uniqueMissingLinkedids.length === 0) {
      return resolved;
    }

    const events = await this.prisma.rawAmiEvents.findMany({
      where: {
        tenantId,
        linkedid: { in: uniqueMissingLinkedids },
        eventName: { in: ['Newchannel', 'Newexten', 'VarSet'] },
      },
      orderBy: [{ linkedid: 'asc' }, { eventTime: 'asc' }],
      select: {
        linkedid: true,
        payload: true,
      },
    });

    for (const event of events) {
      if (resolved.has(event.linkedid ?? '')) {
        continue;
      }

      const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
        ? event.payload as Record<string, unknown>
        : {};
      const raw = payload.raw && typeof payload.raw === 'object' && !Array.isArray(payload.raw)
        ? payload.raw as Record<string, unknown>
        : {};

      const topLevelDnis = typeof payload.dnis === 'string' ? payload.dnis : null;
      const rawExten = typeof raw.Exten === 'string' ? raw.Exten : null;
      const rawVariable = typeof raw.Variable === 'string' ? raw.Variable : null;
      const rawValue = typeof raw.Value === 'string' ? raw.Value : null;

      const candidate =
        (rawVariable === '__ENTRY_DID' ? this.normalizeDidCandidate(rawValue) : null) ??
        this.normalizeDidCandidate(topLevelDnis) ??
        this.normalizeDidCandidate(rawExten);

      if (candidate && event.linkedid) {
        resolved.set(event.linkedid, candidate);
      }
    }

    return resolved;
  }

  private async getQueueDisplayNameMap(tenantId: string, queueNames: Array<string | null | undefined>) {
    const normalized = [...new Set(
      queueNames
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    )];
    if (normalized.length === 0) {
      return new Map<string, string>();
    }

    const queues = await this.prisma.queues.findMany({
      where: {
        tenantId,
        queueName: { in: normalized },
      },
      select: {
        queueName: true,
        queueDisplayName: true,
      },
    });

    return new Map(queues.map((queue) => [queue.queueName, queue.queueDisplayName]));
  }

  private getRecordingContentType(fileFormat?: string | null, fileName?: string | null) {
    const normalized = (fileFormat?.trim() || extname(fileName ?? '').replace('.', '')).toLowerCase();
    switch (normalized) {
      case 'wav':
        return 'audio/wav';
      case 'mp3':
        return 'audio/mpeg';
      case 'ogg':
        return 'audio/ogg';
      case 'webm':
        return 'audio/webm';
      case 'm4a':
      case 'mp4':
        return 'audio/mp4';
      case 'aac':
        return 'audio/aac';
      case 'flac':
        return 'audio/flac';
      default:
        return 'application/octet-stream';
    }
  }

  async getActiveCalls(tenantId: string, branchId?: string, limit = 500) {
    const branchScope = await this.getBranchScope(tenantId, branchId);
    const take = Math.min(Math.max(Math.trunc(limit) || 500, 1), 1000);
    const rows = await this.prisma.callSessions.findMany({
      where: {
        tenantId,
        sessionStatus: { not: 'ENDED' },
        ...(this.buildBranchCallFilter(branchScope) ?? {}),
      },
      orderBy: { startedAt: 'desc' },
      take,
    });

    // 에이전트 이름 일괄 조회
    const agentIds = [...new Set(
      rows.map((r) => r.primaryAgentId).filter((id): id is string => Boolean(id)),
    )];
    const agentNameMap = new Map<string, string>();
    if (agentIds.length > 0) {
      const agents = await this.prisma.agents.findMany({
        where: { agentId: { in: agentIds }, tenantId },
        select: { agentId: true, agentName: true },
      });
      for (const a of agents) agentNameMap.set(a.agentId, a.agentName);
    }
    const linkedids = [...new Set(
      rows.map((r) => r.linkedid).filter((id): id is string => Boolean(id)),
    )];
    const latestTransferCandidateMap = await this.getLatestTransferCandidateMap(tenantId, linkedids);
    const didMetaMap = await this.getDidMetaMap(
      tenantId,
      rows.map((row) => row.didNumber ?? row.dnis),
    );
    const muteStateMap = await this.getMuteStateMap(rows.map((row) => row.callId));
    const customers = await this.getRealtimeCustomerMap(tenantId, rows);

    const now = new Date();
    const data = rows.map((r, index) => {
      // 대기시간: 통화 중이면 queuedAt→answeredAt, 아직 대기 중이면 queuedAt→now
      const waitSeconds = r.answeredAt && r.queuedAt
        ? Math.round((r.answeredAt.getTime() - r.queuedAt.getTime()) / 1000)
        : r.queuedAt
          ? Math.round((now.getTime() - r.queuedAt.getTime()) / 1000)
          : 0;

      return {
        ...r,
        agentName: agentNameMap.get(r.primaryAgentId ?? '') ?? '',
        waitSeconds: Math.max(0, waitSeconds),
        latestTransfer: latestTransferCandidateMap.get(r.linkedid) ?? null,
        customer: customers[index],
        isMuted: muteStateMap.get(r.callId) ?? false,
        representativeNumber:
          didMetaMap.get(r.didNumber ?? r.dnis ?? '')?.representativeNumber ?? null,
      };
    });

    return { success: true, data, error: null };
  }

  async getCallDetail(tenantId: string, callId: string) {
    const call = await this.prisma.callSessions.findFirst({
      where: { callId, tenantId },
      include: {
        callLegs: true,
        callMemos: { orderBy: { createdAt: 'desc' } },
        callTransfers: true,
        callRecordings: true,
        queueEvents: true,
        customer: {
          include: {
            phones: { where: { isActive: true }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
          },
        },
      },
    });

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    const transferCandidates = await this.prisma.attendedTransferCandidates.findMany({
      where: {
        tenantId: call.tenantId,
        linkedid: call.linkedid,
      },
      orderBy: { requestedAt: 'desc' },
    });
    const didMetaMap = await this.getDidMetaMap( call.tenantId, [call.didNumber ?? call.dnis] );
    const didMeta = didMetaMap.get(call.didNumber ?? call.dnis ?? '');

    const customerHistory = call.customerId
      ? await this.prisma.callSessions.findMany({
          where: { tenantId, customerId: call.customerId, callId: { not: callId } },
          orderBy: { startedAt: 'desc' },
          take: 5,
          select: {
            callId: true,
            direction: true,
            sessionStatus: true,
            startedAt: true,
            answeredAt: true,
            endedAt: true,
            talkSeconds: true,
            queueName: true,
            primaryAgent: { select: { agentName: true } },
          },
        })
      : [];

    return {
      success: true,
      data: {
        ...call,
        representativeNumber: didMeta?.representativeNumber ?? null,
        transferCandidates,
        customerHistory,
      },
      error: null,
    };
  }

  // conv 40: Originate 성공 판정은 OriginateResponse 가 아니라 후속
  // DialBegin/DialEnd/BridgeEnter/Newstate(Up) 흐름으로 SessionEngine 이 담당.
  // REST 는 accepted=true 만 즉시 반환.
  private async resolveAllowedOutboundCallerId(tenantId: string, requestedCallerId?: string) {
    const settings = await this.prisma.tenantSystemSettings.findUnique({
      where: { tenantId },
      select: {
        allowedOutboundCallerIds: true,
        defaultOutboundCallerId: true,
      },
    } as any) as
      | { allowedOutboundCallerIds?: string | null; defaultOutboundCallerId?: string | null }
      | null;

    const allowedCallerIds = parseAllowedCallerIds(settings?.allowedOutboundCallerIds);
    if (allowedCallerIds.length === 0) {
      throw new BadRequestException('허용된 발신번호가 설정되어 있지 않습니다.');
    }

    const callerId = requestedCallerId?.trim()
      ? normalizeCallerId(requestedCallerId)
      : settings?.defaultOutboundCallerId ?? null;

    if (!callerId) {
      throw new BadRequestException('기본 발신번호가 설정되어 있지 않습니다.');
    }

    if (!allowedCallerIds.includes(callerId)) {
      throw new BadRequestException('허용되지 않은 발신번호입니다.');
    }

    return callerId;
  }

  async getOutboundDialOptions(tenantId: string) {
    const settings = await this.prisma.tenantSystemSettings.findUnique({
      where: { tenantId },
      select: {
        allowedOutboundCallerIds: true,
        defaultOutboundCallerId: true,
      },
    } as any) as
      | { allowedOutboundCallerIds?: string | null; defaultOutboundCallerId?: string | null }
      | null;

    const allowedCallerIds = parseAllowedCallerIds(settings?.allowedOutboundCallerIds);
    return {
      allowedCallerIds,
      defaultCallerId: settings?.defaultOutboundCallerId ?? allowedCallerIds[0] ?? null,
    };
  }

  async getOutboundCallCapabilities(tenantId: string, agentId: string) {
    const agent = await this.prisma.agents.findFirst({
      where: {
        tenantId,
        agentId,
        isActive: true,
      },
      select: {
        extension: true,
        settingsProfile: true,
      },
    });
    if (!agent) {
      throw new ForbiddenException('인증된 상담원 세션을 확인할 수 없습니다.');
    }

    const outboundDialOptions = await this.getOutboundDialOptions(tenantId);
    const outboundDialPermissions = extractOutboundDialPermissions(agent.settingsProfile);
    const disabledReasons: string[] = [];
    const hasExtension = Boolean(agent.extension?.trim());
    const hasExternalCategoryPermission =
      outboundDialPermissions.domestic
      || outboundDialPermissions.representative
      || outboundDialPermissions.paid
      || outboundDialPermissions.international;

    if (!hasExtension) {
      disabledReasons.push('상담원 내선이 설정되어 있지 않습니다.');
    }
    if (outboundDialOptions.allowedCallerIds.length === 0) {
      disabledReasons.push('허용된 발신번호가 설정되어 있지 않습니다.');
    }
    if (!hasExternalCategoryPermission) {
      disabledReasons.push('외부 발신 번호 유형 권한이 없습니다.');
    }

    return {
      canOriginateExternal: disabledReasons.length === 0,
      canOriginateInternal: hasExtension,
      canUsePhoneDirect: outboundDialPermissions.phoneDirect
        && outboundDialPermissions.phoneDirectAllowedIps.length > 0,
      outboundDialPermissions,
      outboundDialOptions,
      disabledReasons,
    };
  }

  async originateFromClientProtocol(
    tenantId: string,
    dto: ClientOriginateCommandDto,
    protocolInput: ClientCommandProtocolInput,
    metaInput?: CommandMetaInput,
    actor?: CallCommandActor,
  ) {
    const verifiedProtocol = this.assertClientCommandProtocol(protocolInput);
    if (!metaInput?.correlationId?.trim() || !metaInput?.idempotencyKey?.trim()) {
      throw new BadRequestException('발신 명령 correlationId 와 idempotencyKey 가 필요합니다.');
    }

    const verifiedActor = await this.resolveCommandActor(tenantId, actor);
    if (!verifiedActor?.extension?.trim()) {
      throw new ForbiddenException('인증된 상담원 내선을 확인할 수 없습니다.');
    }
    await this.assertClientCommandNonceUnused(tenantId, verifiedActor.agentId, verifiedProtocol.nonce);

    const result = await this.originate(
      tenantId,
      {
        agentExtension: verifiedActor.extension,
        phoneNumber: dto.phoneNumber,
        customerId: dto.customerId,
        callerId: dto.callerId,
      },
      metaInput,
      verifiedActor,
    );

    await this.eventBus.publish('client.call.command.originate.accepted', {
      commandId: dto.commandId,
      protocol: verifiedProtocol.protocol,
      requestedByAgentId: verifiedActor.agentId,
      requestedByExtension: verifiedActor.extension,
      phoneNumber: dto.phoneNumber,
      callerId: dto.callerId ?? null,
      correlationId: result.data.correlationId,
      idempotencyKey: result.data.idempotencyKey,
      requestedAt: result.data.requestedAt,
    }, tenantId);

    return result;
  }

  async originate(
    tenantId: string,
    dto: OriginateDto,
    metaInput?: CommandMetaInput,
    actor?: CallCommandActor,
  ) {
    const meta = normalizeCommandMeta(metaInput);
    const verifiedActor = await this.resolveCommandActor(tenantId, actor);
    let agentExtension = dto.agentExtension.trim();
    if (!agentExtension) {
      throw new BadRequestException('상담원 내선이 필요합니다.');
    }
    if (verifiedActor && !this.isSupervisoryActor(verifiedActor)) {
      if (agentExtension !== verifiedActor.extension) {
        throw new ForbiddenException('본인 내선으로만 발신할 수 있습니다.');
      }
      agentExtension = verifiedActor.extension ?? agentExtension;
    }

    const phoneNumber = normalizeAllowedOutboundDialNumber(
      dto.phoneNumber,
      verifiedActor?.outboundDialPermissions,
    );
    const callerId = await this.resolveAllowedOutboundCallerId(tenantId, dto.callerId);
    this.sessionEngine?.registerPendingOriginate({
      tenantId,
      agentExtension,
      phoneNumber,
      callerId,
      customerId: dto.customerId,
    });
    const { channel } = this.asteriskManager.originate({
      agentExtension,
      phoneNumber,
      callerId,
    });

    await this.eventBus.publish('ami.command.originate.requested', {
      agentExtension,
      phoneNumber,
      callerId,
      customerId: dto.customerId,
      requestedByAgentId: verifiedActor?.agentId ?? null,
      ...meta,
    }, tenantId);

    return {
      success: true,
      data: buildAcceptedCommand({ channel }, meta),
      error: null,
    };
  }

  async originateInternal(
    tenantId: string,
    params: { agentId: string; agentExtension: string; targetExtension: string; targetAgentId?: string },
    metaInput?: CommandMetaInput,
    actor?: CallCommandActor,
  ) {
    const meta = normalizeCommandMeta(metaInput);
    const verifiedActor = await this.resolveCommandActor(tenantId, actor);
    const requesterExtension = verifiedActor?.extension ?? params.agentExtension.trim();
    const targetExtension = params.targetExtension.trim();
    if (!targetExtension) {
      throw new BadRequestException('대상 내선이 필요합니다.');
    }
    if (targetExtension === requesterExtension) {
      throw new BadRequestException('본인 내선으로는 통화 요청을 보낼 수 없습니다.');
    }

    const targetAgent = await this.prisma.agents.findFirst({
      where: {
        tenantId,
        extension: targetExtension,
        ...(params.targetAgentId ? { agentId: params.targetAgentId } : {}),
        isActive: true,
      },
      select: {
        agentId: true,
        agentName: true,
        extension: true,
      },
    });
    if (!targetAgent) {
      throw new NotFoundException('대상 상담원을 찾을 수 없습니다.');
    }

    const { channel } = this.asteriskManager.originateInternal({
      agentExtension: requesterExtension,
      targetExtension,
    });

    const payload = {
      requestedByAgentId: verifiedActor?.agentId ?? params.agentId,
      requestedByExtension: requesterExtension,
      targetAgentId: targetAgent.agentId,
      targetExtension: targetAgent.extension,
      ...meta,
    };
    await this.eventBus.publish('ami.command.originate.internal.requested', payload, tenantId);

    return {
      success: true,
      data: {
        targetAgent,
        ...buildAcceptedCommand({ channel }, meta),
      },
      error: null,
    };
  }

  async transfer(
    tenantId: string,
    callId: string,
    dto: TransferDto,
    metaInput?: CommandMetaInput,
    actor?: CallCommandActor,
  ) {
    const meta = normalizeCommandMeta(metaInput);
    const requestedAt = new Date(meta.requestedAt);
    const verifiedActor = await this.resolveCommandActor(tenantId, actor);
    const call = await this.prisma.callSessions.findFirst({
      where: { callId, tenantId },
      include: {
        callLegs: { orderBy: { startedAt: 'desc' } },
      },
    });
    if (!call) {
      throw new NotFoundException('Call not found');
    }

    // conv 26 leg 선택 규칙: "legType === 'agent' 이면서 아직 끝나지 않은" leg.
    // 가장 최근 leg 휴리스틱보다 정확 — transfer 는 상담원 쪽 채널을 redirect
    // 하는 동작이므로 고객 쪽 trunk leg 를 잡으면 안 된다.
    const agentLeg = call.callLegs.find(
      (leg) => leg.legType === 'agent' && !leg.endedAt,
    );
    const controlChannel = agentLeg?.channelName;
    if (!controlChannel) {
      throw new BadRequestException('상담원 제어 채널을 찾을 수 없습니다.');
    }
    this.assertActorCanControlCall(call, agentLeg, verifiedActor);
    this.assertTransferTargetAllowed(dto.target, verifiedActor);
    const fromExtension = this.getChannelEndpoint(controlChannel) ?? dto.fromExtension.trim();

    await this.prisma.callTransfers.create({
      data: {
        tenantId: call.tenantId,
        callId: call.callId,
        linkedid: call.linkedid,
        transferType: dto.transferType,
        fromExtension,
        toExtension: dto.target,
        requestedAt,
        transferResult: 'REQUESTED',
      },
    });

    const updatedCall = await this.prisma.callSessions.update({
      where: { callId },
      data: { transferFlag: true, sessionStatus: 'TRANSFERRING' },
    });

    if (dto.transferType === 'attended') {
      await this.transferDetector.recordRequest({
        tenantId: call.tenantId,
        linkedid: call.linkedid,
        fromAgentId: call.primaryAgentId ?? undefined,
        fromExtension,
        toExtension: dto.target,
      });
    }

    if (dto.transferType === 'attended') {
      this.asteriskManager.attendedTransfer(controlChannel, dto.target);
    } else {
      this.asteriskManager.blindTransfer(controlChannel, dto.target);
    }

    await this.eventBus.publish(REALTIME_EVENTS.CALL_UPDATED, updatedCall, call.tenantId);
    await this.eventBus.publish('ami.command.transfer.requested', {
      callId,
      transferType: dto.transferType,
      target: dto.target,
      fromExtension,
      requestedByAgentId: verifiedActor?.agentId ?? null,
      ...meta,
    }, call.tenantId);

    return {
      success: true,
      data: buildAcceptedCommand({ callId, transferred: true }, meta),
      error: null,
    };
  }

  async cancelAttendedTransfer(
    tenantId: string,
    callId: string,
    metaInput?: CommandMetaInput,
    actor?: CallCommandActor,
  ) {
    const meta = normalizeCommandMeta(metaInput);
    const verifiedActor = await this.resolveCommandActor(tenantId, actor);
    const call = await this.prisma.callSessions.findFirst({
      where: { callId, tenantId },
      include: {
        callLegs: { orderBy: { startedAt: 'desc' } },
      },
    });
    if (!call) {
      throw new NotFoundException('Call not found');
    }

    const candidate = await this.prisma.attendedTransferCandidates.findFirst({
      where: {
        tenantId: call.tenantId,
        linkedid: call.linkedid,
        phase: {
          in: ['REQUESTED', 'CONSULT_RINGING', 'CONSULT_TALKING', 'REBRIDGING'] as any,
        },
      },
      orderBy: { requestedAt: 'desc' },
    });
    if (!candidate) {
      throw new BadRequestException('취소 가능한 상담 전환이 없습니다.');
    }

    const agentLeg = call.callLegs.find(
      (leg) => leg.legType === 'agent' && !leg.endedAt,
    );
    if (!agentLeg?.channelName) {
      throw new BadRequestException('상담원 제어 채널을 찾을 수 없습니다.');
    }
    this.assertActorCanControlCall(call, agentLeg, verifiedActor);

    const now = new Date();
    await this.prisma.attendedTransferCandidates.update({
      where: { candidateId: candidate.candidateId },
      data: {
        phase: 'FAILED',
        completedAt: now,
        updatedAt: now,
      },
    });

    const pendingTransfer = await this.prisma.callTransfers.findFirst({
      where: {
        tenantId: call.tenantId,
        linkedid: call.linkedid,
        transferType: 'attended',
        OR: [{ transferResult: null }, { transferResult: 'REQUESTED' }],
      },
      orderBy: { requestedAt: 'desc' },
    });
    if (pendingTransfer) {
      await this.prisma.callTransfers.update({
        where: { transferId: pendingTransfer.transferId },
        data: {
          transferResult: 'CANCELED',
          completedAt: now,
        },
      });
    }

    await this.prisma.callSessions.update({
      where: { callId },
      data: {
        sessionStatus: call.answeredAt ? 'TALKING' : 'RINGING_AGENT',
        updatedAt: now,
      },
    });

    this.asteriskManager.cancelAttendedTransfer(agentLeg.channelName);
    await this.eventBus.publish('ami.command.transfer.cancel.requested', {
      callId,
      linkedid: call.linkedid,
      candidateId: candidate.candidateId,
      ...meta,
    }, call.tenantId);

    return {
      success: true,
      data: buildAcceptedCommand({
        callId,
        canceled: true,
      }, meta),
      error: null,
    };
  }

  async completeAttendedTransfer(
    tenantId: string,
    callId: string,
    metaInput?: CommandMetaInput,
    actor?: CallCommandActor,
  ) {
    const meta = normalizeCommandMeta(metaInput);
    const verifiedActor = await this.resolveCommandActor(tenantId, actor);
    const call = await this.prisma.callSessions.findFirst({
      where: { callId, tenantId },
      include: {
        callLegs: { orderBy: { startedAt: 'desc' } },
      },
    });
    if (!call) {
      throw new NotFoundException('Call not found');
    }

    const candidate = await this.prisma.attendedTransferCandidates.findFirst({
      where: {
        tenantId: call.tenantId,
        linkedid: call.linkedid,
        phase: {
          in: ['REQUESTED', 'CONSULT_RINGING', 'CONSULT_TALKING', 'REBRIDGING'] as any,
        },
      },
      orderBy: { requestedAt: 'desc' },
    });
    if (!candidate) {
      throw new BadRequestException('완료 가능한 상담 전환이 없습니다.');
    }

    const agentLeg = call.callLegs.find(
      (leg) => leg.legType === 'agent' && !leg.endedAt,
    );
    if (!agentLeg?.channelName) {
      throw new BadRequestException('상담원 제어 채널을 찾을 수 없습니다.');
    }
    this.assertActorCanControlCall(call, agentLeg, verifiedActor);

    const now = new Date();
    await this.prisma.callSessions.update({
      where: { callId },
      data: {
        sessionStatus: 'TRANSFERRING',
        updatedAt: now,
      },
    });

    this.asteriskManager.completeAttendedTransfer(agentLeg.channelName);
    await this.eventBus.publish('ami.command.transfer.complete.requested', {
      callId,
      linkedid: call.linkedid,
      candidateId: candidate.candidateId,
      ...meta,
    }, call.tenantId);

    return {
      success: true,
      data: buildAcceptedCommand({
        callId,
      }, meta),
      error: null,
    };
  }

  async pickup(
    tenantId: string,
    callId: string,
    params: { agentId: string; extension: string },
    metaInput?: CommandMetaInput,
    actor?: CallCommandActor,
  ) {
    const meta = normalizeCommandMeta(metaInput);
    const verifiedActor = await this.resolveCommandActor(tenantId, actor);
    if (verifiedActor && !this.isSupervisoryActor(verifiedActor)) {
      if (params.agentId !== verifiedActor.agentId || params.extension !== verifiedActor.extension) {
        throw new ForbiddenException('본인 내선으로만 당겨받을 수 있습니다.');
      }
    }
    const call = await this.prisma.callSessions.findFirst({
      where: { callId, tenantId },
      include: {
        callLegs: { orderBy: { startedAt: 'desc' } },
      },
    });
    if (!call) {
      throw new NotFoundException('Call not found');
    }

    if (!['QUEUED', 'RINGING_AGENT'].includes(call.sessionStatus)) {
      throw new BadRequestException('현재 상태에서는 당겨받기를 요청할 수 없습니다.');
    }

    const customerLeg = call.callLegs.find(
      (leg) => ['inbound', 'customer'].includes(leg.legType) && !leg.endedAt,
    );
    if (!customerLeg?.channelName) {
      throw new BadRequestException('당겨받기 대상 고객 채널을 찾을 수 없습니다.');
    }
    await this.assertPickupAllowed(tenantId, call, params.agentId);

    await this.prisma.callSessions.update({
      where: { callId },
      data: {
        primaryAgentId: params.agentId,
        sessionStatus: 'RINGING_AGENT',
        ringingAt: call.ringingAt ?? new Date(),
        updatedAt: new Date(),
      },
    });

    this.asteriskManager.pickup(customerLeg.channelName, params.extension);
    await this.eventBus.publish('ami.command.pickup.requested', {
      callId,
      linkedid: call.linkedid,
      agentId: params.agentId,
      extension: params.extension,
      ...meta,
    }, call.tenantId);

    return {
      success: true,
      data: buildAcceptedCommand({
        callId,
        extension: params.extension,
      }, meta),
      error: null,
    };
  }

  private async assertPickupAllowed(
    tenantId: string,
    call: { queueName?: string | null; primaryAgentId?: string | null },
    agentId: string,
  ) {
    const requester = await this.prisma.agents.findFirst({
      where: { tenantId, agentId, isActive: true },
      select: { agentId: true, agentGroupId: true },
    });
    if (!requester) {
      throw new ForbiddenException('당겨받기를 요청한 상담원을 찾을 수 없습니다.');
    }

    const queueMembership = call.queueName
      ? await this.prisma.queueAgentMembers.findFirst({
          where: {
            tenantId,
            agentId,
            isActive: true,
            queue: { tenantId, queueName: call.queueName, isActive: true },
          },
          select: { agentId: true },
        })
      : null;
    if (queueMembership) {
      return;
    }

    if (call.primaryAgentId && call.primaryAgentId !== agentId && requester.agentGroupId) {
      const target = await this.prisma.agents.findFirst({
        where: { tenantId, agentId: call.primaryAgentId, isActive: true },
        select: { agentId: true, agentGroupId: true },
      });
      if (target?.agentGroupId && target.agentGroupId === requester.agentGroupId) {
        return;
      }
    }

    throw new ForbiddenException('같은 상담원 그룹 또는 같은 호 분배룰 소속 상담원만 당겨받을 수 있습니다.');
  }

  async mute(
    tenantId: string,
    callId: string,
    dto: MuteCallDto,
    metaInput?: CommandMetaInput,
    actor?: CallCommandActor,
  ) {
    const meta = normalizeCommandMeta(metaInput);
    const verifiedActor = await this.resolveCommandActor(tenantId, actor);
    const call = await this.prisma.callSessions.findFirst({
      where: { callId, tenantId },
      include: { callLegs: { orderBy: { startedAt: 'desc' } } },
    });
    if (!call) {
      throw new NotFoundException('Call not found');
    }

    const agentLeg = call.callLegs.find(
      (leg) => leg.legType === 'agent' && !leg.endedAt,
    );
    if (!agentLeg?.channelName) {
      throw new BadRequestException('상담원 제어 채널을 찾을 수 없습니다.');
    }
    this.assertActorCanControlCall(call, agentLeg, verifiedActor);

    const state = dto.state ?? 'on';
    const direction = dto.direction ?? 'all';
    this.asteriskManager.muteAudio(agentLeg.channelName, state, direction);
    await this.redis.getClient().set(this.muteStateKey(callId), state === 'on' ? '1' : '0', 'EX', 86_400);
    const { callLegs: _callLegs, ...callPayload } = call;

    await this.eventBus.publish('ami.command.mute.requested', {
      callId,
      linkedid: call.linkedid,
      channel: agentLeg.channelName,
      state,
      direction,
      ...meta,
    }, call.tenantId);
    await this.eventBus.publish(
      REALTIME_EVENTS.CALL_UPDATED,
      {
        ...callPayload,
        isMuted: state === 'on',
      },
      call.tenantId,
    );

    return {
      success: true,
      data: buildAcceptedCommand({
        callId,
        state,
        direction,
        isMuted: state === 'on',
      }, meta),
      error: null,
    };
  }

  getCallControlCapabilities() {
    const holdCode = process.env.ASTERISK_HOLD_FEATURE_CODE?.trim() ?? '';
    const resumeCode = process.env.ASTERISK_RESUME_FEATURE_CODE?.trim() ?? '';
    return {
      muteEnabled: true,
      holdEnabled: Boolean(holdCode && resumeCode),
      holdMode: holdCode && resumeCode ? 'feature_code' : 'disabled',
    };
  }

  async hold(
    tenantId: string,
    callId: string,
    action: 'hold' | 'resume',
    metaInput?: CommandMetaInput,
    actor?: CallCommandActor,
  ) {
    const meta = normalizeCommandMeta(metaInput);
    const verifiedActor = await this.resolveCommandActor(tenantId, actor);
    const holdCode = process.env.ASTERISK_HOLD_FEATURE_CODE?.trim() ?? '';
    const resumeCode = process.env.ASTERISK_RESUME_FEATURE_CODE?.trim() ?? '';
    const featureCode = action === 'hold' ? holdCode : resumeCode;
    if (!featureCode) {
      throw new BadRequestException('현재 PBX 설정에서는 hold/resume 제어가 비활성화되어 있습니다.');
    }

    const call = await this.prisma.callSessions.findFirst({
      where: { callId, tenantId },
      include: { callLegs: { orderBy: { startedAt: 'desc' } } },
    });
    if (!call) {
      throw new NotFoundException('Call not found');
    }

    const agentLeg = call.callLegs.find(
      (leg) => leg.legType === 'agent' && !leg.endedAt,
    );
    if (!agentLeg?.channelName) {
      throw new BadRequestException('상담원 제어 채널을 찾을 수 없습니다.');
    }
    this.assertActorCanControlCall(call, agentLeg, verifiedActor);

    this.asteriskManager.sendFeatureCode(agentLeg.channelName, featureCode);
    await this.eventBus.publish('ami.command.hold.requested', {
      callId,
      linkedid: call.linkedid,
      channel: agentLeg.channelName,
      action,
      ...meta,
    }, call.tenantId);

    return {
      success: true,
      data: buildAcceptedCommand({
        callId,
        action,
      }, meta),
      error: null,
    };
  }

  async saveMemo(tenantId: string, callId: string, dto: CreateMemoDto) {
    const call = await this.prisma.callSessions.findFirst({ where: { callId, tenantId } });
    if (!call) {
      throw new NotFoundException('Call not found');
    }

    const memo = await this.prisma.callMemos.create({
      data: {
        callId,
        tenantId: call.tenantId,
        agentId: dto.agentId,
        customerId: call.customerId,
        memoType: dto.memoType,
        resultCode: dto.resultCode,
        subResultCode: dto.subResultCode,
        memoText: dto.memoText,
        isFinal: dto.isFinal ?? true,
      },
    });

    return { success: true, data: memo, error: null };
  }

  async hangup(
    tenantId: string,
    callId: string,
    metaInput?: CommandMetaInput,
    actor?: CallCommandActor,
  ) {
    const meta = normalizeCommandMeta(metaInput);
    const verifiedActor = await this.resolveCommandActor(tenantId, actor);
    const call = await this.prisma.callSessions.findFirst({
      where: { callId, tenantId },
      include: { callLegs: { orderBy: { startedAt: 'desc' } } },
    });
    if (!call) {
      throw new NotFoundException('Call not found');
    }

    // hangup 도 상담원 쪽 leg 를 끊는다. 고객 쪽을 끊으면 상담원 채널이 dangling.
    const agentLeg = call.callLegs.find(
      (leg) => leg.legType === 'agent' && !leg.endedAt,
    );
    this.assertActorCanControlCall(call, agentLeg, verifiedActor);
    if (agentLeg?.channelName) {
      this.asteriskManager.hangup(agentLeg.channelName);
    } else {
      this.logger.warn(`hangup: no active agent leg for callId=${callId}, AMI action skipped`);
    }

    await this.eventBus.publish('ami.command.hangup.requested', {
      callId,
      linkedid: call.linkedid,
      ...meta,
    }, call.tenantId);

    return {
      success: true,
      data: buildAcceptedCommand({ callId }, meta),
      error: null,
    };
  }

  async listHistory(tenantId: string, q: ListCallsQueryDto) {
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 7 * 86_400_000);
    const to   = q.to   ? new Date(q.to)   : new Date();
    const branchScope = await this.getBranchScope(tenantId, q.branchId);

    const where: Prisma.callSessionsWhereInput = {
      tenantId,
      startedAt: { gte: from, lte: to },
      ...(this.buildBranchCallFilter(branchScope) ?? {}),
    };
    if (q.agentId)           where.primaryAgentId = q.agentId;
    if (q.status)            where.sessionStatus  = q.status;
    if (q.mode === 'missed') { where.sessionStatus = 'ENDED'; where.answeredAt = null; }
    if (q.resultCode)        where.resultCode = q.resultCode;
    if (q.queueName)         where.queueName = q.queueName;
    if (q.direction)         where.direction = q.direction;
    const abandon = this.parseBooleanFilter(q.abandon);
    if (abandon !== undefined) where.abandonFlag = abandon;
    const recording = this.parseBooleanFilter(q.recording);
    if (recording !== undefined) where.recordingFlag = recording;

    const rows = await this.prisma.callSessions.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: 500,
      select: {
        callId: true, linkedid: true, ani: true, dnis: true, didNumber: true, queueName: true,
        sessionStatus: true, direction: true,
        resultCode: true,
        startedAt: true, answeredAt: true, endedAt: true,
        waitSeconds: true, talkSeconds: true,
        abandonFlag: true, recordingFlag: true,
        customer: {
          select: {
            customerName: true,
          },
        },
        callMemos: {
          where: { isFinal: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            resultCode: true,
          },
        },
        primaryAgent: { select: { agentName: true } },
      },
    });
    const linkedids = [...new Set(rows.map((row) => row.linkedid).filter(Boolean))];
    const latestTransferCandidateMap = await this.getLatestTransferCandidateMap(tenantId, linkedids);
    const resolvedDidMap = await this.getResolvedDidMap(
      tenantId,
      rows.map((row) => ({
        linkedid: row.linkedid,
        didNumber: row.didNumber,
        dnis: row.dnis,
      })),
    );
    const didMetaMap = await this.getDidMetaMap(
      tenantId,
      rows.map((row) => resolvedDidMap.get(row.linkedid) ?? row.didNumber ?? row.dnis),
    );
    const queueDisplayNameMap = await this.getQueueDisplayNameMap(
      tenantId,
      rows.map((row) => row.queueName),
    );
    const agentByExtensionMap = await this.getAgentByExtensionMap(
      tenantId,
      rows.flatMap((row) => [row.ani, row.dnis]),
    );
    const defaultOutboundCallerId = await this.getDefaultOutboundCallerId(tenantId);
    const data = rows.map((row) => {
      const ani = row.ani?.trim() ?? '';
      const dnis = row.dnis?.trim() ?? '';
      const primaryAgent = row.primaryAgent
        ?? agentByExtensionMap.get(ani)
        ?? agentByExtensionMap.get(dnis)
        ?? null;
      const agentAni = agentByExtensionMap.has(ani);
      const agentDnis = agentByExtensionMap.has(dnis);
      const looksLikeDesktopOutbound = agentAni && !agentDnis && Boolean(dnis);
      const resolvedDidNumber = looksLikeDesktopOutbound
        ? defaultOutboundCallerId ?? row.didNumber ?? null
        : resolvedDidMap.get(row.linkedid) ?? row.didNumber ?? null;
      const representativeNumber = looksLikeDesktopOutbound
        ? defaultOutboundCallerId ?? null
        : didMetaMap.get(resolvedDidMap.get(row.linkedid) ?? row.didNumber ?? row.dnis ?? '')?.representativeNumber ?? null;

      return {
        ...row,
        direction: looksLikeDesktopOutbound ? 'OUTBOUND' : row.direction,
        ani: looksLikeDesktopOutbound ? defaultOutboundCallerId ?? row.ani : row.ani,
        primaryAgent,
        didNumber: resolvedDidNumber,
        queueDisplayName: queueDisplayNameMap.get(row.queueName ?? '') ?? row.queueName ?? null,
        latestTransfer: latestTransferCandidateMap.get(row.linkedid) ?? null,
        missedReason: this.getMissedReason(row),
        representativeNumber,
      };
    });
    return { success: true, data, error: null };
  }

  private async getDefaultOutboundCallerId(tenantId: string) {
    const settings = await this.prisma.tenantSystemSettings.findUnique({
      where: { tenantId },
      select: {
        allowedOutboundCallerIds: true,
        defaultOutboundCallerId: true,
      },
    } as any) as
      | { allowedOutboundCallerIds?: string | null; defaultOutboundCallerId?: string | null }
      | null;
    const defaultCallerId = settings?.defaultOutboundCallerId?.trim();
    if (defaultCallerId) {
      return defaultCallerId;
    }
    return parseAllowedCallerIds(settings?.allowedOutboundCallerIds)[0] ?? null;
  }

  private async getAgentByExtensionMap(
    tenantId: string,
    values: Array<string | null | undefined>,
  ): Promise<Map<string, { agentName: string }>> {
    const extensions = [...new Set(values
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value) && /^\d{2,8}$/.test(value)))];
    if (extensions.length === 0) {
      return new Map();
    }

    const agents = await this.prisma.agents.findMany({
      where: { tenantId, extension: { in: extensions } },
      select: { agentId: true, agentName: true, extension: true },
    });

    return new Map(agents.map((agent) => [agent.extension, { agentName: agent.agentName }]));
  }

  async listRecordings(tenantId: string, q: { from?: string; to?: string; branchId?: string }) {
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 7 * 86_400_000);
    const to   = q.to   ? new Date(q.to)   : new Date();
    const branchScope = await this.getBranchScope(tenantId, q.branchId);

    const rows = await this.prisma.callRecordings.findMany({
      where: {
        tenantId,
        recordingStartedAt: { gte: from, lte: to },
        ...(branchScope
          ? {
              OR: [
                { session: { primaryAgentId: { in: branchScope.agentIds } } },
                { session: { queueId: { in: branchScope.queueIds } } },
              ],
            }
          : {}),
      },
      orderBy: { recordingStartedAt: 'desc' },
      take: 200,
      select: {
        recordingId: true, linkedid: true, fileName: true,
        fileFormat: true, fileSizeBytes: true,
        durationSeconds: true, recordingStartedAt: true,
        session: {
          select: {
            linkedid: true, ani: true, dnis: true, didNumber: true, queueName: true,
            primaryAgent: { select: { agentName: true } },
          },
        },
      },
    });
    const recordingSessions = rows
      .map((row) => row.session)
      .filter(Boolean) as Array<{
        linkedid: string;
        ani: string;
        dnis: string | null;
        didNumber: string | null;
        queueName: string;
        primaryAgent: { agentName: string } | null;
      }>;
    const resolvedDidMap = await this.getResolvedDidMap(
      tenantId,
      recordingSessions.map((session) => ({
        linkedid: session.linkedid,
        didNumber: session.didNumber,
        dnis: session.dnis,
      })),
    );
    const didMetaMap = await this.getDidMetaMap(
      tenantId,
      rows.map((row) => {
        const linkedid = row.session?.linkedid ?? '';
        return resolvedDidMap.get(linkedid) ?? row.session?.didNumber ?? row.session?.dnis;
      }),
    );
    const queueDisplayNameMap = await this.getQueueDisplayNameMap(
      tenantId,
      rows.map((row) => row.session?.queueName),
    );
    const data = rows.map((row) => ({
      ...row,
      fileSizeBytes: row.fileSizeBytes == null ? null : row.fileSizeBytes.toString(),
      session: row.session
        ? {
            ...row.session,
            didNumber: resolvedDidMap.get(row.session.linkedid) ?? row.session.didNumber ?? null,
            queueDisplayName: queueDisplayNameMap.get(row.session.queueName ?? '') ?? row.session.queueName ?? null,
            representativeNumber:
              didMetaMap.get(
                resolvedDidMap.get(row.session.linkedid) ?? row.session.didNumber ?? row.session.dnis ?? '',
              )?.representativeNumber ?? null,
          }
        : null,
    }));
    return { success: true, data, error: null };
  }

  async getRecordingFile(tenantId: string, recordingId: string) {
    const recording = await this.prisma.callRecordings.findFirst({
      where: {
        tenantId,
        recordingId,
      },
      select: {
        recordingId: true,
        tenantId: true,
        filePath: true,
        fileName: true,
        fileFormat: true,
        fileSizeBytes: true,
        storageProvider: true,
        recordingStatus: true,
        encryptionStatus: true,
        encryptedFilePath: true,
        callId: true,
        linkedid: true,
      },
    });

    if (!recording) {
      throw new NotFoundException('Recording not found');
    }

    if ((recording.storageProvider ?? 'local') !== 'local') {
      throw new BadRequestException('현재는 로컬 저장 녹취만 지원합니다.');
    }

    return {
      ...recording,
      contentType: this.getRecordingContentType(recording.fileFormat, recording.fileName),
    };
  }

  async openRecordingReadStream(
    recording: {
      filePath: string;
      encryptedFilePath?: string | null;
      encryptionStatus?: string | null;
    },
    rangeHeader?: string,
  ): Promise<{
    stream: NodeJS.ReadableStream;
    size: number;
    statusCode: 200 | 206;
    contentRange?: string;
  } | null> {
    if (recording.encryptionStatus === 'ENCRYPTED') {
      if (!recording.encryptedFilePath || !this.recordingEncryption) {
        throw new BadRequestException('암호화 녹취를 복호화할 수 없습니다.');
      }
      const buffer = await this.recordingEncryption.decryptFileToBuffer(recording.encryptedFilePath);
      return this.buildBufferReadStream(buffer, rangeHeader);
    }

    const stat = await fs.stat(recording.filePath).catch(() => null);
    if (!stat?.isFile()) {
      return null;
    }
    const range = this.parseRange(rangeHeader, stat.size);
    if (!rangeHeader) {
      return { stream: createReadStream(recording.filePath), size: stat.size, statusCode: 200 };
    }
    if (!range) return null;
    return {
      stream: createReadStream(recording.filePath, { start: range.start, end: range.end }),
      size: range.end - range.start + 1,
      statusCode: 206,
      contentRange: `bytes ${range.start}-${range.end}/${stat.size}`,
    };
  }

  private buildBufferReadStream(buffer: Buffer, rangeHeader?: string) {
    const range = this.parseRange(rangeHeader, buffer.length);
    if (!rangeHeader) {
      return { stream: Readable.from(buffer), size: buffer.length, statusCode: 200 as const };
    }
    if (!range) return null;
    return {
      stream: Readable.from(buffer.subarray(range.start, range.end + 1)),
      size: range.end - range.start + 1,
      statusCode: 206 as const,
      contentRange: `bytes ${range.start}-${range.end}/${buffer.length}`,
    };
  }

  private parseRange(rangeHeader: string | undefined, size: number) {
    if (!rangeHeader) return null;
    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    const start = match?.[1] ? Number.parseInt(match[1], 10) : 0;
    const requestedEnd = match?.[2] ? Number.parseInt(match[2], 10) : size - 1;
    const end = Number.isFinite(requestedEnd) ? Math.min(requestedEnd, size - 1) : size - 1;
    if (!match || !Number.isFinite(start) || start < 0 || start > end || start >= size) {
      return null;
    }
    return { start, end };
  }

  async recordRecordingDownloadAudit(
    tenantId: string,
    recording: {
      recordingId: string;
      callId?: string | null;
      linkedid?: string | null;
    },
    audit: {
      agentId?: string | null;
      userRole?: string | null;
      clientIp?: string | null;
      userAgent?: string | null;
    },
  ) {
    await (this.prisma as any).callRecordingAccessAuditLogs.create({
      data: {
        tenantId,
        recordingId: recording.recordingId,
        callId: recording.callId,
        linkedid: recording.linkedid,
        agentId: audit.agentId ?? null,
        userRole: audit.userRole ?? null,
        action: 'DOWNLOAD',
        clientIp: audit.clientIp ?? null,
        userAgent: audit.userAgent ?? null,
        success: true,
      },
    });
  }
}
