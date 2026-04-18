import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TransferDetectorService } from './transfer-detector.service';

// conv 44 SESSION_PRECEDENCE: 역순 도착 이벤트로 인한 상태 역행 차단.
// 숫자가 클수록 "더 진행된" 상태. 현재 상태가 이보다 같거나 높으면 새 이벤트의
// sessionStatus 갱신을 무시한다 (다른 필드는 그대로 반영).
export const SESSION_PRECEDENCE: Record<string, number> = {
  NEW: 0,
  QUEUED: 10,
  RINGING_AGENT: 20,
  TALKING: 30,
  HOLD: 35,
  TRANSFERRING: 40,
  AFTER_CALL_WORK: 50,
  ENDED: 100,
};

export function statusRank(status?: string | null) {
  if (!status) return -1;
  return SESSION_PRECEDENCE[status] ?? -1;
}

// conv 44 + share 69de045b: AMI 이벤트 중복 처리 방지.
// fingerprint = sha256(node + Event + Linkedid + Uniqueid + Channel + DestChannel + time-bucket)
// time-bucket 은 1초 단위로 떨어뜨려 같은 이벤트의 재전송을 같은 해시로 잡는다.
export function computeFingerprint(event: Record<string, any>): string {
  const ts = event.eventTime ? new Date(event.eventTime).getTime() : Date.now();
  const bucket = Math.floor(ts / 1000);
  const raw = [
    event.nodeId || process.env.ASTERISK_NODE_ID || 'default',
    event.eventName || '',
    event.linkedid || event.Linkedid || '',
    event.uniqueid || event.Uniqueid || '',
    event.channel || event.Channel || '',
    event.destChannel || event.DestChannel || '',
    bucket,
  ].join('|');
  return createHash('sha256').update(raw).digest('hex');
}

const DEDUPE_TTL_SECONDS = 21600; // 6h — conv 44 권장값

@Injectable()
export class SessionEngineService {
  private readonly logger = new Logger(SessionEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly transferDetector: TransferDetectorService,
  ) {}

  async processNormalizedEvent(event: Record<string, any>) {
    const linkedid = event.linkedid || event.Linkedid;
    if (!linkedid) return;

    // 1단계: Redis fast dedupe. SET NX EX 로 키를 선점하지 못하면 다른 경로에서
    //        이미 처리한 이벤트이므로 즉시 skip.
    const fingerprint = computeFingerprint(event);
    try {
      const dedupeKey = `dedupe:ami:${fingerprint}`;
      const ok = await this.redis
        .getClient()
        .set(dedupeKey, '1', 'EX', DEDUPE_TTL_SECONDS, 'NX');
      if (ok !== 'OK') {
        this.logger.debug(`dedupe skip ${event.eventName} fp=${fingerprint.slice(0, 12)}`);
        return;
      }
    } catch (err) {
      // Redis 장애 시에도 DB unique 가 최종 방어선이 되도록 계속 진행.
      this.logger.warn(`redis dedupe failed: ${(err as Error).message}`);
    }

    // 2단계: DB insert. unique(tenantId, eventFingerprint) 로 최종 방어.
    try {
      await this.prisma.rawAmiEvents.create({
        data: {
          tenantId: event.tenantId,
          linkedid,
          uniqueid: event.uniqueid || event.Uniqueid,
          eventName: event.eventName,
          eventTime: event.eventTime ? new Date(event.eventTime) : new Date(),
          eventFingerprint: fingerprint,
          payload: event as any,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.logger.debug(`db dedupe skip ${event.eventName} fp=${fingerprint.slice(0, 12)}`);
        return;
      }
      throw err;
    }

    switch (event.eventName) {
      case 'QueueCallerJoin':
        await this.upsertSession(
          linkedid,
          {
            sessionStatus: 'QUEUED',
            queuedAt: new Date(),
            ani: event.ani,
            dnis: event.dnis,
            queueName: event.queueName,
          },
          event.tenantId,
        );
        break;
      case 'AgentCalled':
        await this.upsertSession(
          linkedid,
          { sessionStatus: 'RINGING_AGENT', ringingAt: new Date() },
          event.tenantId,
        );
        break;
      case 'AgentConnect':
      case 'BridgeEnter':
        await this.upsertSession(
          linkedid,
          {
            sessionStatus: 'TALKING',
            answeredAt: new Date(),
            primaryAgentId: event.agentId,
          },
          event.tenantId,
        );
        break;
      case 'Hold':
        await this.markHold(
          linkedid,
          event.tenantId,
          event.eventTime ? new Date(event.eventTime) : new Date(),
        );
        break;
      case 'Unhold':
        await this.resumeHold(
          linkedid,
          event.tenantId,
          event.eventTime ? new Date(event.eventTime) : new Date(),
        );
        break;
      case 'Hangup':
        await this.finalizeHangup(linkedid, event.tenantId);
        break;
      case 'AgentComplete':
        await this.upsertSession(linkedid, { sessionStatus: 'AFTER_CALL_WORK' }, event.tenantId);
        break;
      case 'BlindTransfer':
      case 'AttendedTransfer':
        // Transfer Detector 에 위임. 세션 상태는 API 요청 시점에 이미
        // TRANSFERRING 으로 바꿨으므로 여기서는 추가 상태 전이 없음.
        break;
      default:
        this.logger.debug(`Unhandled event ${event.eventName}`);
    }

    // share 69de045b: transfer 관련 이벤트를 transfer detector 에도 흘린다.
    // detector 는 best-effort — 실패해도 메인 처리를 막지 않는다.
    if (
      event.eventName === 'BlindTransfer' ||
      event.eventName === 'AttendedTransfer'
    ) {
      await this.transferDetector.handle(event);
    }
  }

  private async upsertSession(
    linkedid: string,
    patch: Record<string, any>,
    tenantId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.callSessions.findFirst({ where: { linkedid, tenantId } });

      if (!found) {
        const created = await tx.callSessions.create({
          data: {
            tenantId,
            linkedid,
            direction: 'inbound',
            sessionStatus: patch.sessionStatus || 'NEW',
            ani: patch.ani,
            aniNormalized: patch.ani,
            dnis: patch.dnis,
            queueName: patch.queueName,
            startedAt: new Date(),
            queuedAt: patch.queuedAt,
            ringingAt: patch.ringingAt,
            answeredAt: patch.answeredAt,
            primaryAgentId: patch.primaryAgentId,
          },
        });

        await this.enqueueOutbox(tx, tenantId, 'call.created', created);
        return;
      }

      // conv 44 역행 가드: 이미 더 진행된 상태면 sessionStatus 필드만 떨어뜨리고
      // timestamps/agent 같은 보조 필드는 그대로 덮어쓴다.
      const { sessionStatus, ...rest } = patch;
      const data: Prisma.callSessionsUpdateInput = { ...rest };
      if (sessionStatus && statusRank(sessionStatus) > statusRank(found.sessionStatus)) {
        data.sessionStatus = sessionStatus;
      } else if (sessionStatus && sessionStatus !== found.sessionStatus) {
        this.logger.debug(
          `skip status regression ${found.sessionStatus} -> ${sessionStatus} (linkedid=${linkedid})`,
        );
      }

      const updated = await tx.callSessions.update({
        where: { callId: found.callId },
        data,
      });

      await this.enqueueOutbox(tx, tenantId, 'call.updated', updated);
    });
  }

  private async finalizeHangup(linkedid: string, tenantId: string) {
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.callSessions.findFirst({ where: { linkedid, tenantId } });
      if (!found || found.sessionStatus === 'ENDED') return;

      const endedAt = new Date();
      const talkSeconds = found.answeredAt
        ? Math.max(0, Math.floor((endedAt.getTime() - found.answeredAt.getTime()) / 1000))
        : 0;
      const pendingHoldSeconds = found.sessionStatus === 'HOLD'
        ? Math.max(0, Math.floor((endedAt.getTime() - found.updatedAt.getTime()) / 1000))
        : 0;

      const updated = await tx.callSessions.update({
        where: { callId: found.callId },
        data: {
          sessionStatus: 'ENDED',
          endedAt,
          talkSeconds,
          holdSeconds: found.holdSeconds + pendingHoldSeconds,
        },
      });

      await this.enqueueOutbox(tx, tenantId, 'call.ended', updated);
    });
  }

  private async markHold(linkedid: string, tenantId: string, eventAt: Date) {
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.callSessions.findFirst({ where: { linkedid, tenantId } });
      if (!found || found.sessionStatus === 'ENDED' || !found.answeredAt) return;
      if (found.sessionStatus === 'HOLD') return;

      const updated = await tx.callSessions.update({
        where: { callId: found.callId },
        data: {
          sessionStatus: 'HOLD',
          updatedAt: eventAt,
        },
      });

      await this.enqueueOutbox(tx, tenantId, 'call.updated', updated);
    });
  }

  private async resumeHold(linkedid: string, tenantId: string, eventAt: Date) {
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.callSessions.findFirst({ where: { linkedid, tenantId } });
      if (!found || found.sessionStatus !== 'HOLD') return;

      const additionalHoldSeconds = Math.max(
        0,
        Math.floor((eventAt.getTime() - found.updatedAt.getTime()) / 1000),
      );

      const updated = await tx.callSessions.update({
        where: { callId: found.callId },
        data: {
          sessionStatus: 'TALKING',
          holdSeconds: found.holdSeconds + additionalHoldSeconds,
          updatedAt: eventAt,
        },
      });

      await this.enqueueOutbox(tx, tenantId, 'call.updated', updated);
    });
  }

  // conv 44: 상태 전이와 같은 트랜잭션 안에서 outbox row 를 기록한다.
  // 실제 발행은 OutboxPublisherService 가 리더 노드에서 주기적으로 담당한다.
  private async enqueueOutbox(
    tx: Prisma.TransactionClient,
    tenantId: string,
    eventType: string,
    payload: any,
  ) {
    await tx.eventOutbox.create({
      data: {
        tenantId,
        eventType,
        aggregateType: 'callSession',
        aggregateId: payload?.callId ?? null,
        payload: JSON.parse(JSON.stringify(payload)) as any,
      },
    });
  }
}
