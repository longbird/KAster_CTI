import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { AmiLeaderElectionService } from '../redis/ami-leader-election.service';

// conv 29·32·35 + share 69de045b:
// blind/attended transfer 의 완료 판정과 call_transfers 결과 확정을 담당한다.
// AMI 원시 이벤트에는 이미 BlindTransfer / AttendedTransfer 이벤트가 "완료 시점에"
// 떨어지므로, 최소 구현은 이 두 이벤트를 받아 REQUESTED → COMPLETED 로 닫는 것.
//
// 후속 확장 여지 (지금은 범위 밖, TODO):
//   - CONSULT_RINGING / CONSULT_TALKING / REBRIDGING 중간 상태 추적
//     → DialBegin/DialEnd, BridgeEnter/Leave 상관관계 필요
//   - 실패 판정 (consult DialEnd BUSY/NOANSWER + 원 상담원 고객 지속 통화)
//   - 타임아웃 sweep (REQUESTED 상태로 N분 이상 방치된 candidate 를 EXPIRED 처리)

export type TransferPhase =
  | 'REQUESTED'
  | 'CONSULT_RINGING'
  | 'CONSULT_TALKING'
  | 'REBRIDGING'
  | 'COMPLETED'
  | 'FAILED'
  | 'EXPIRED';

@Injectable()
export class TransferDetectorService implements OnModuleInit {
  private readonly logger = new Logger(TransferDetectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leader: AmiLeaderElectionService,
  ) {}

  onModuleInit(): void {
    // 5분마다 만료 sweep. 리더 노드만 실행.
    setInterval(() => {
      if (!this.leader.isLeader()) return;
      this.sweepExpired().catch((err) =>
        this.logger.warn(`sweep failed: ${(err as Error).message}`),
      );
    }, 5 * 60_000);
  }

  // SessionEngineService 가 정규화 이벤트를 받은 직후 호출한다.
  // 여기는 best-effort 로 동작 — 실패해도 세션 처리 자체를 막으면 안 된다.
  async handle(event: Record<string, any>): Promise<void> {
    try {
      const eventName = event.eventName;
      if (eventName === 'BlindTransfer') {
        await this.completeTransfer(event, 'blind');
      } else if (eventName === 'AttendedTransfer') {
        await this.completeTransfer(event, 'attended');
      } else if (eventName === 'DialBegin') {
        await this.markConsultRinging(event);
      } else if (eventName === 'BridgeEnter') {
        await this.markConsultTalking(event);
      } else if (eventName === 'BridgeLeave') {
        await this.markRebridging(event);
      } else if (eventName === 'DialEnd') {
        await this.markConsultFailed(event);
      }
    } catch (err) {
      this.logger.warn(`transfer-detector failed: ${(err as Error).message}`);
    }
  }

  private async getOpenCandidate(tenantId: string, linkedid: string) {
    return this.prisma.attendedTransferCandidates.findFirst({
      where: {
        tenantId,
        linkedid,
        phase: {
          in: ['REQUESTED', 'CONSULT_RINGING', 'CONSULT_TALKING', 'REBRIDGING'] as TransferPhase[] as any,
        },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  private async getRecentFailedCandidate(tenantId: string, linkedid: string, withinSeconds = 60) {
    const cutoff = new Date(Date.now() - withinSeconds * 1000);
    return this.prisma.attendedTransferCandidates.findFirst({
      where: {
        tenantId,
        linkedid,
        phase: 'FAILED',
        updatedAt: { gte: cutoff },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private eventMentionsExtension(raw: Record<string, any>, extension?: string | null): boolean {
    if (!extension) return false;
    const needle = String(extension).trim();
    if (!needle) return false;

    const fields = [
      raw.Extension,
      raw.Exten,
      raw.DestExten,
      raw.ConnectedLineNum,
      raw.CallerIDNum,
      raw.DialString,
      raw.Channel,
      raw.DestChannel,
      raw.Destination,
    ]
      .filter(Boolean)
      .map((value) => String(value));

    return fields.some((value) => value.includes(needle));
  }

  private eventMentionsUniqueid(raw: Record<string, any>, uniqueid?: string | null): boolean {
    if (!uniqueid) return false;
    const needle = String(uniqueid).trim();
    if (!needle) return false;

    const fields = [
      raw.Uniqueid,
      raw.DestUniqueid,
      raw.SecondTransfererUniqueid,
      raw.OrigTransfererUniqueid,
      raw.TransfererUniqueid,
      raw.TransfereeUniqueid,
    ]
      .filter(Boolean)
      .map((value) => String(value));

    return fields.includes(needle);
  }

  private async updateCandidatePhase(
    candidateId: string,
    phase: TransferPhase,
    extraData?: Record<string, any>,
  ) {
    await this.prisma.attendedTransferCandidates.update({
      where: { candidateId },
      data: {
        phase,
        updatedAt: new Date(),
        ...extraData,
      },
    });
  }

  private async restoreCallSessionAfterTransferFallback(
    tenantId: string,
    linkedid: string,
    now: Date,
  ) {
    const session = await this.prisma.callSessions.findFirst({
      where: { tenantId, linkedid },
      select: { callId: true, answeredAt: true },
    });
    if (!session) return;

    await this.prisma.callSessions.update({
      where: { callId: session.callId },
      data: {
        sessionStatus: session.answeredAt ? 'TALKING' : 'RINGING_AGENT',
        transferFlag: false,
        updatedAt: now,
      },
    });
  }

  private async markConsultRinging(event: Record<string, any>) {
    const tenantId = event.tenantId;
    const linkedid = event.linkedid || event.Linkedid;
    if (!tenantId || !linkedid) return;

    const raw = event.raw ?? {};
    const candidate = await this.getOpenCandidate(tenantId, linkedid);
    if (!candidate) return;
    if (!this.eventMentionsExtension(raw, candidate.toExtension)) return;

    await this.updateCandidatePhase(candidate.candidateId, 'CONSULT_RINGING', {
      consultUniqueid: candidate.consultUniqueid ?? raw.DestUniqueid ?? raw.Uniqueid ?? event.uniqueid ?? null,
      targetUniqueid: candidate.targetUniqueid ?? raw.Uniqueid ?? event.uniqueid ?? null,
    });
  }

  private async markConsultTalking(event: Record<string, any>) {
    const tenantId = event.tenantId;
    const linkedid = event.linkedid || event.Linkedid;
    if (!tenantId || !linkedid) return;

    const raw = event.raw ?? {};
    const candidate = await this.getOpenCandidate(tenantId, linkedid);
    if (candidate) {
      const matchesTarget =
        this.eventMentionsExtension(raw, candidate.toExtension) ||
        this.eventMentionsUniqueid(raw, candidate.consultUniqueid) ||
        this.eventMentionsUniqueid(raw, candidate.targetUniqueid);
      if (matchesTarget) {
        await this.updateCandidatePhase(candidate.candidateId, 'CONSULT_TALKING', {
          consultUniqueid: candidate.consultUniqueid ?? raw.DestUniqueid ?? raw.Uniqueid ?? event.uniqueid ?? null,
          targetUniqueid: candidate.targetUniqueid ?? raw.Uniqueid ?? event.uniqueid ?? null,
        });
        return;
      }
    }

    const failedCandidate = await this.getRecentFailedCandidate(tenantId, linkedid);
    if (!failedCandidate) return;

    const matchesOriginalLeg =
      this.eventMentionsExtension(raw, failedCandidate.fromExtension) ||
      this.eventMentionsUniqueid(raw, failedCandidate.targetUniqueid);
    if (!matchesOriginalLeg) return;

    await this.updateCandidatePhase(failedCandidate.candidateId, 'REBRIDGING');
  }

  private async markRebridging(event: Record<string, any>) {
    const tenantId = event.tenantId;
    const linkedid = event.linkedid || event.Linkedid;
    if (!tenantId || !linkedid) return;

    const raw = event.raw ?? {};
    const candidate = await this.getOpenCandidate(tenantId, linkedid);
    const failedCandidate = candidate ? null : await this.getRecentFailedCandidate(tenantId, linkedid);
    const activeCandidate = candidate ?? failedCandidate;
    if (!activeCandidate) return;

    const matchesTarget =
      this.eventMentionsExtension(raw, activeCandidate.toExtension) ||
      this.eventMentionsUniqueid(raw, activeCandidate.consultUniqueid) ||
      this.eventMentionsUniqueid(raw, activeCandidate.targetUniqueid) ||
      this.eventMentionsExtension(raw, activeCandidate.fromExtension);
    if (!matchesTarget) return;

    await this.updateCandidatePhase(activeCandidate.candidateId, 'REBRIDGING');
  }

  private async markConsultFailed(event: Record<string, any>) {
    const tenantId = event.tenantId;
    const linkedid = event.linkedid || event.Linkedid;
    if (!tenantId || !linkedid) return;

    const raw = event.raw ?? {};
    const dialStatus = String(raw.DialStatus ?? '').toUpperCase();
    if (!['BUSY', 'NOANSWER', 'CANCEL', 'CHANUNAVAIL', 'CONGESTION'].includes(dialStatus)) {
      return;
    }

    const candidate = await this.getOpenCandidate(tenantId, linkedid);
    if (!candidate) return;

    const matchesTarget =
      this.eventMentionsExtension(raw, candidate.toExtension) ||
      this.eventMentionsUniqueid(raw, candidate.consultUniqueid) ||
      this.eventMentionsUniqueid(raw, candidate.targetUniqueid);
    if (!matchesTarget) return;

    const now = new Date();
    await this.prisma.attendedTransferCandidates.update({
      where: { candidateId: candidate.candidateId },
      data: {
        phase: 'FAILED',
        expiredAt: null,
        completedAt: null,
        updatedAt: now,
      },
    });

    const pending = await this.prisma.callTransfers.findFirst({
      where: {
        tenantId,
        linkedid,
        transferType: 'attended',
        OR: [{ transferResult: null }, { transferResult: 'REQUESTED' }],
      },
      orderBy: { requestedAt: 'desc' },
    });
    if (pending) {
      await this.prisma.callTransfers.update({
        where: { transferId: pending.transferId },
        data: {
          transferResult: 'FAILED',
          completedAt: now,
        },
      });
    }

    await this.restoreCallSessionAfterTransferFallback(tenantId, linkedid, now);
  }

  private async completeTransfer(event: Record<string, any>, type: 'blind' | 'attended') {
    const tenantId = event.tenantId;
    const linkedid = event.linkedid || event.Linkedid;
    if (!tenantId || !linkedid) return;

    const raw = event.raw ?? {};
    const consultUniqueid =
      raw.SecondTransfererUniqueid || raw.TransfereeUniqueid || event.uniqueid || null;
    const targetUniqueid =
      raw.OrigTransfererUniqueid || raw.Uniqueid || event.uniqueid || null;
    const fromExtension = raw.OrigTransfererCallerIDNum || raw.CallerIDNum || null;
    const toExtension = raw.Extension || raw.Exten || null;

    // candidate upsert: 이미 REQUESTED 가 들려 있으면 그대로 COMPLETED 로 닫고,
    // 없으면 완료 상태로 바로 생성.
    const existing = await this.getOpenCandidate(tenantId, linkedid);

    const now = new Date();
    if (existing) {
      await this.prisma.attendedTransferCandidates.update({
        where: { candidateId: existing.candidateId },
        data: {
          phase: 'COMPLETED',
          completedAt: now,
          consultUniqueid: existing.consultUniqueid ?? consultUniqueid,
          targetUniqueid: existing.targetUniqueid ?? targetUniqueid,
          updatedAt: now,
        },
      });
    } else {
      await this.prisma.attendedTransferCandidates.create({
        data: {
          tenantId,
          linkedid,
          fromExtension,
          toExtension,
          consultUniqueid,
          targetUniqueid,
          phase: 'COMPLETED',
          requestedAt: now,
          completedAt: now,
        },
      });
    }

    // 기존 callTransfers 행 중 아직 결과가 안 닫힌 것을 COMPLETED 로 확정.
    // CallsService 가 API 요청 시점에 REQUESTED 로 행을 만들어 두므로 여기서는
    // 그 행을 찾아 업데이트한다. 여러 개면 가장 최근 것을 고른다.
    const pending = await this.prisma.callTransfers.findFirst({
      where: {
        tenantId,
        linkedid,
        transferType: type,
        OR: [{ transferResult: null }, { transferResult: 'REQUESTED' }],
      },
      orderBy: { requestedAt: 'desc' },
    });
    if (pending) {
      await this.prisma.callTransfers.update({
        where: { transferId: pending.transferId },
        data: {
          transferResult: 'COMPLETED',
          completedAt: now,
        },
      });
    }

    this.logger.log(
      `transfer detected: type=${type} linkedid=${linkedid} -> COMPLETED`,
    );
  }

  // API 측에서 transfer 요청 직후 호출해 REQUESTED candidate 를 남겨두면
  // 위 completeTransfer 에서 매칭이 정확해진다 (선택적).
  async recordRequest(params: {
    tenantId: string;
    linkedid: string;
    fromAgentId?: string;
    fromExtension?: string;
    toExtension: string;
  }): Promise<void> {
    await this.prisma.attendedTransferCandidates.create({
      data: {
        tenantId: params.tenantId,
        linkedid: params.linkedid,
        fromAgentId: params.fromAgentId,
        fromExtension: params.fromExtension,
        toExtension: params.toExtension,
        phase: 'REQUESTED',
        requestedAt: new Date(),
      },
    });
  }

  // 후속: 오래된 REQUESTED candidate 를 EXPIRED 로 만들어 탐지 누락 방어.
  // SessionRecoverySweeperService 와 같은 방식으로 리더 노드에서 주기 sweep.
  async sweepExpired(olderThanMinutes = 15): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
    const expiredCandidates = await this.prisma.attendedTransferCandidates.findMany({
      where: {
        phase: { in: ['REQUESTED', 'CONSULT_RINGING', 'CONSULT_TALKING', 'REBRIDGING'] as TransferPhase[] as any },
        requestedAt: { lt: cutoff },
      },
      select: {
        candidateId: true,
        tenantId: true,
        linkedid: true,
      },
    });
    if (expiredCandidates.length === 0) {
      return 0;
    }

    const now = new Date();
    const result = await this.prisma.attendedTransferCandidates.updateMany({
      where: {
        candidateId: { in: expiredCandidates.map((candidate) => candidate.candidateId) },
      },
      data: { phase: 'EXPIRED', expiredAt: now, updatedAt: now },
    });

    for (const candidate of expiredCandidates) {
      const pending = await this.prisma.callTransfers.findFirst({
        where: {
          tenantId: candidate.tenantId,
          linkedid: candidate.linkedid,
          transferType: 'attended',
          OR: [{ transferResult: null }, { transferResult: 'REQUESTED' }],
        },
        orderBy: { requestedAt: 'desc' },
      });
      if (pending) {
        await this.prisma.callTransfers.update({
          where: { transferId: pending.transferId },
          data: {
            transferResult: 'EXPIRED',
            completedAt: now,
          },
        });
      }

      await this.restoreCallSessionAfterTransferFallback(
        candidate.tenantId,
        candidate.linkedid,
        now,
      );
    }

    return result.count;
  }
}
