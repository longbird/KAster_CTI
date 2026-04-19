import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeCallerId, parseAllowedCallerIds } from '../../common/outbound-caller-id.util';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EventBusService } from '../events/event-bus.service';
import { AsteriskManagerService } from './asterisk-manager.service';
import { CreateMemoDto } from './dto/create-memo.dto';
import { InternalOriginateDto } from './dto/internal-originate.dto';
import { ListCallsQueryDto } from './dto/list-calls-query.dto';
import { MuteCallDto } from './dto/mute-call.dto';
import { OriginateDto } from './dto/originate.dto';
import { TransferDto } from './dto/transfer.dto';
import { TransferDetectorService } from './transfer-detector.service';
import { normalizePhone } from '../customers/customers.service';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventBus: EventBusService,
    private readonly asteriskManager: AsteriskManagerService,
    private readonly transferDetector: TransferDetectorService,
  ) {}

  private muteStateKey(callId: string) {
    return `kaster:cti:call:${callId}:mute`;
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

      customers.forEach((customer) => {
        byCustomerId.set(customer.customerId, {
          customerId: customer.customerId,
          customerName: customer.customerName ?? '미식별 고객',
          grade: customer.grade ?? 'NORMAL',
          phoneNumber: customer.phones[0]?.phoneNumber ?? '',
          companyName: customer.companyName ?? undefined,
          memo: customer.memo ?? undefined,
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

  async getActiveCalls(tenantId: string, branchId?: string) {
    const branchScope = await this.getBranchScope(tenantId, branchId);
    const rows = await this.prisma.callSessions.findMany({
      where: {
        tenantId,
        sessionStatus: { not: 'ENDED' },
        ...(this.buildBranchCallFilter(branchScope) ?? {}),
      },
      orderBy: { startedAt: 'desc' },
      take: 100,
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
        callMemos: true,
        callTransfers: true,
        callRecordings: true,
        queueEvents: true,
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

    return {
      success: true,
      data: {
        ...call,
        representativeNumber: didMeta?.representativeNumber ?? null,
        transferCandidates,
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

  async originate(tenantId: string, dto: OriginateDto) {
    const callerId = await this.resolveAllowedOutboundCallerId(tenantId, dto.callerId);
    const { channel } = this.asteriskManager.originate({
      agentExtension: dto.agentExtension,
      phoneNumber: dto.phoneNumber,
      callerId,
    });

    await this.eventBus.publish('ami.command.originate.requested', dto);

    return {
      success: true,
      data: { accepted: true, channel, requestedAt: new Date().toISOString() },
      error: null,
    };
  }

  async originateInternal(
    tenantId: string,
    params: { agentId: string; agentExtension: string; targetExtension: string; targetAgentId?: string },
  ) {
    const targetExtension = params.targetExtension.trim();
    if (!targetExtension) {
      throw new BadRequestException('대상 내선이 필요합니다.');
    }
    if (targetExtension === params.agentExtension) {
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
      agentExtension: params.agentExtension,
      targetExtension,
    });

    const payload = {
      requestedByAgentId: params.agentId,
      requestedByExtension: params.agentExtension,
      targetAgentId: targetAgent.agentId,
      targetExtension: targetAgent.extension,
      requestedAt: new Date().toISOString(),
    };
    await this.eventBus.publish('ami.command.originate.internal.requested', payload);

    return {
      success: true,
      data: {
        accepted: true,
        channel,
        targetAgent,
        requestedAt: payload.requestedAt,
      },
      error: null,
    };
  }

  async transfer(tenantId: string, callId: string, dto: TransferDto) {
    const call = await this.prisma.callSessions.findFirst({
      where: { callId, tenantId },
      include: {
        callLegs: { orderBy: { startedAt: 'desc' } },
      },
    });
    if (!call) {
      throw new NotFoundException('Call not found');
    }

    await this.prisma.callTransfers.create({
      data: {
        tenantId: call.tenantId,
        callId: call.callId,
        linkedid: call.linkedid,
        transferType: dto.transferType,
        fromExtension: dto.fromExtension,
        toExtension: dto.target,
        requestedAt: new Date(),
        transferResult: 'REQUESTED',
      },
    });

    await this.prisma.callSessions.update({
      where: { callId },
      data: { transferFlag: true, sessionStatus: 'TRANSFERRING' },
    });

    if (dto.transferType === 'attended') {
      await this.transferDetector.recordRequest({
        tenantId: call.tenantId,
        linkedid: call.linkedid,
        fromAgentId: call.primaryAgentId ?? undefined,
        fromExtension: dto.fromExtension,
        toExtension: dto.target,
      });
    }

    // conv 26 leg 선택 규칙: "legType === 'agent' 이면서 아직 끝나지 않은" leg.
    // 가장 최근 leg 휴리스틱보다 정확 — transfer 는 상담원 쪽 채널을 redirect
    // 하는 동작이므로 고객 쪽 trunk leg 를 잡으면 안 된다.
    const agentLeg = call.callLegs.find(
      (leg) => leg.legType === 'agent' && !leg.endedAt,
    );
    const controlChannel = agentLeg?.channelName;

    if (controlChannel) {
      if (dto.transferType === 'attended') {
        this.asteriskManager.attendedTransfer(controlChannel, dto.target);
      } else {
        this.asteriskManager.blindTransfer(controlChannel, dto.target);
      }
    } else {
      this.logger.warn(
        `transfer: no active agent leg for callId=${callId}, AMI action skipped`,
      );
    }

    await this.eventBus.publish('ami.command.transfer.requested', { callId, ...dto });

    return { success: true, data: { callId, transferred: true }, error: null };
  }

  async cancelAttendedTransfer(tenantId: string, callId: string) {
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
      requestedAt: now.toISOString(),
    });

    return {
      success: true,
      data: {
        callId,
        canceled: true,
        requestedAt: now.toISOString(),
      },
      error: null,
    };
  }

  async completeAttendedTransfer(tenantId: string, callId: string) {
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
      requestedAt: now.toISOString(),
    });

    return {
      success: true,
      data: {
        callId,
        accepted: true,
        requestedAt: now.toISOString(),
      },
      error: null,
    };
  }

  async pickup(tenantId: string, callId: string, params: { agentId: string; extension: string }) {
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
    });

    return {
      success: true,
      data: {
        callId,
        accepted: true,
        extension: params.extension,
        requestedAt: new Date().toISOString(),
      },
      error: null,
    };
  }

  async mute(tenantId: string, callId: string, dto: MuteCallDto) {
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

    const state = dto.state ?? 'on';
    const direction = dto.direction ?? 'all';
    this.asteriskManager.muteAudio(agentLeg.channelName, state, direction);
    await this.redis.getClient().set(this.muteStateKey(callId), state === 'on' ? '1' : '0', 'EX', 86_400);

    await this.eventBus.publish('ami.command.mute.requested', {
      callId,
      linkedid: call.linkedid,
      channel: agentLeg.channelName,
      state,
      direction,
      requestedAt: new Date().toISOString(),
    });

    return {
      success: true,
      data: {
        callId,
        accepted: true,
        state,
        direction,
        isMuted: state === 'on',
      },
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

  async hold(tenantId: string, callId: string, action: 'hold' | 'resume') {
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

    this.asteriskManager.sendFeatureCode(agentLeg.channelName, featureCode);
    await this.eventBus.publish('ami.command.hold.requested', {
      callId,
      linkedid: call.linkedid,
      channel: agentLeg.channelName,
      action,
      requestedAt: new Date().toISOString(),
    });

    return {
      success: true,
      data: {
        callId,
        accepted: true,
        action,
      },
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

  async hangup(tenantId: string, callId: string) {
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
    if (agentLeg?.channelName) {
      this.asteriskManager.hangup(agentLeg.channelName);
    } else {
      this.logger.warn(`hangup: no active agent leg for callId=${callId}, AMI action skipped`);
    }

    await this.eventBus.publish('ami.command.hangup.requested', { callId });

    return { success: true, data: { callId, accepted: true }, error: null };
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
    const didMetaMap = await this.getDidMetaMap(
      tenantId,
      rows.map((row) => row.didNumber ?? row.dnis),
    );
    const data = rows.map((row) => ({
      ...row,
      latestTransfer: latestTransferCandidateMap.get(row.linkedid) ?? null,
      representativeNumber:
        didMetaMap.get(row.didNumber ?? row.dnis ?? '')?.representativeNumber ?? null,
    }));
    return { success: true, data, error: null };
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
            ani: true, dnis: true, didNumber: true, queueName: true,
            primaryAgent: { select: { agentName: true } },
          },
        },
      },
    });
    const didMetaMap = await this.getDidMetaMap(
      tenantId,
      rows.map((row) => row.session?.didNumber ?? row.session?.dnis),
    );
    const data = rows.map((row) => ({
      ...row,
      session: row.session
        ? {
            ...row.session,
            representativeNumber:
              didMetaMap.get(row.session.didNumber ?? row.session.dnis ?? '')?.representativeNumber ?? null,
          }
        : null,
    }));
    return { success: true, data, error: null };
  }
}
