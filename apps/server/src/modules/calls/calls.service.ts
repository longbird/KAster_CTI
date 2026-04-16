import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { AsteriskManagerService } from './asterisk-manager.service';
import { CreateMemoDto } from './dto/create-memo.dto';
import { OriginateDto } from './dto/originate.dto';
import { TransferDto } from './dto/transfer.dto';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly asteriskManager: AsteriskManagerService,
  ) {}

  async getActiveCalls(tenantId: string) {
    const rows = await this.prisma.callSessions.findMany({
      where: { tenantId, sessionStatus: { not: 'ENDED' } },
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

    const now = new Date();
    const data = rows.map((r) => {
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
      };
    });

    return { success: true, data, error: null };
  }

  async getCallDetail(callId: string) {
    const call = await this.prisma.callSessions.findUnique({
      where: { callId },
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

    return { success: true, data: call, error: null };
  }

  // conv 40: Originate 성공 판정은 OriginateResponse 가 아니라 후속
  // DialBegin/DialEnd/BridgeEnter/Newstate(Up) 흐름으로 SessionEngine 이 담당.
  // REST 는 accepted=true 만 즉시 반환.
  async originate(dto: OriginateDto) {
    const { channel } = this.asteriskManager.originate({
      agentExtension: dto.agentExtension,
      phoneNumber: dto.phoneNumber,
    });

    await this.eventBus.publish('ami.command.originate.requested', dto);

    return {
      success: true,
      data: { accepted: true, channel, requestedAt: new Date().toISOString() },
      error: null,
    };
  }

  async transfer(callId: string, dto: TransferDto) {
    const call = await this.prisma.callSessions.findUnique({
      where: { callId },
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

  async saveMemo(callId: string, dto: CreateMemoDto) {
    const call = await this.prisma.callSessions.findUnique({ where: { callId } });
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

  async hangup(callId: string) {
    const call = await this.prisma.callSessions.findUnique({
      where: { callId },
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
}
