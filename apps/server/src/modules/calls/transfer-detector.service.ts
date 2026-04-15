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
      }
      // 그 외 이벤트는 일단 무시. 중간 phase 추적은 후속 작업.
    } catch (err) {
      this.logger.warn(`transfer-detector failed: ${(err as Error).message}`);
    }
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
    const existing = await this.prisma.attendedTransferCandidates.findFirst({
      where: { tenantId, linkedid, phase: { notIn: ['COMPLETED', 'FAILED', 'EXPIRED'] } },
      orderBy: { requestedAt: 'desc' },
    });

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
    const result = await this.prisma.attendedTransferCandidates.updateMany({
      where: {
        phase: { in: ['REQUESTED', 'CONSULT_RINGING', 'CONSULT_TALKING', 'REBRIDGING'] as TransferPhase[] as any },
        requestedAt: { lt: cutoff },
      },
      data: { phase: 'EXPIRED', expiredAt: new Date(), updatedAt: new Date() },
    });
    return result.count;
  }
}
