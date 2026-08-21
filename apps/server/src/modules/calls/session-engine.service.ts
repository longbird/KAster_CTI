import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../redis/redis.service';
import { normalizePhone } from '../customers/customers.service';
import { REALTIME_EVENTS } from '../realtime/realtime-events';
import { TransferDetectorService } from './transfer-detector.service';
import { classifyLeg, getChannelEndpointName } from './call-leg.util';

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

function parseNonNegativeSeconds(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

// conv 44 + share 69de045b: AMI 이벤트 중복 처리 방지.
// fingerprint = sha256(node + Event + Linkedid + Uniqueid + Channel + DestChannel + time-bucket)
// time-bucket 은 1초 단위로 떨어뜨려 같은 이벤트의 재전송을 같은 해시로 잡는다.
export function computeFingerprint(event: Record<string, any>): string {
  const ts = event.eventTime ? new Date(event.eventTime).getTime() : Date.now();
  const bucket = Math.floor(ts / 1000);
  const field = (name: string) => event[name] || event.raw?.[name] || '';
  const userEventParts = (event.eventName || event.Event) === 'UserEvent'
    ? [
        field('UserEvent'),
        field('Stage'),
        field('Digit'),
        field('Action'),
        field('Target'),
        field('Result'),
      ]
    : [];
  const raw = [
    event.nodeId || process.env.ASTERISK_NODE_ID || 'default',
    event.eventName || '',
    event.linkedid || event.Linkedid || '',
    event.uniqueid || event.Uniqueid || '',
    event.channel || event.Channel || '',
    event.destChannel || event.DestChannel || '',
    ...userEventParts,
    bucket,
  ].join('|');
  return createHash('sha256').update(raw).digest('hex');
}

const DEDUPE_TTL_SECONDS = 21600; // 6h — conv 44 권장값
const PENDING_ORIGINATE_TTL_MS = 60000;

interface PendingOriginate {
  tenantId: string;
  agentExtension: string;
  phoneNumber: string;
  callerId?: string | null;
  customerId?: string | null;
  registeredAt: number;
}

@Injectable()
export class SessionEngineService {
  private readonly logger = new Logger(SessionEngineService.name);
  private readonly pendingOriginates = new Map<string, PendingOriginate[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly transferDetector: TransferDetectorService,
  ) {}

  private async resolveCustomerId(
    tx: Prisma.TransactionClient,
    tenantId: string,
    rawPhone: string | null | undefined,
  ) {
    const normalizedPhone = normalizePhone(rawPhone ?? '');
    if (!normalizedPhone) return null;

    const phone = await tx.customerPhones.findFirst({
      where: {
        normalizedPhone,
        isActive: true,
        customer: {
          tenantId,
          status: 'active',
        },
      },
      select: {
        customerId: true,
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    return phone?.customerId ?? null;
  }

  private async resolvePrimaryAgentId(candidate: string | null | undefined, tenantId: string) {
    const normalized = candidate?.trim();
    if (!normalized) return undefined;

    const extensionCandidate = normalized
      .replace(/^PJSIP\//i, '')
      .split('-')[0]
      .trim();

    const orConditions: Prisma.agentsWhereInput[] = [];
    if (/^[0-9a-fA-F-]{36}$/.test(normalized)) {
      orConditions.push({ agentId: normalized });
    }
    if (extensionCandidate) {
      orConditions.push({ extension: extensionCandidate });
    }
    if (orConditions.length === 0) {
      return undefined;
    }

    const agent = await this.prisma.agents.findFirst({
      where: {
        tenantId,
        OR: orConditions,
      },
      select: { agentId: true },
    });

    return agent?.agentId;
  }

  registerPendingOriginate(input: {
    tenantId: string;
    agentExtension: string;
    phoneNumber: string;
    callerId?: string | null;
    customerId?: string | null;
  }) {
    const agentExtension = input.agentExtension.trim();
    const phoneNumber = input.phoneNumber.trim();
    if (!input.tenantId || !agentExtension || !phoneNumber) {
      return;
    }

    this.prunePendingOriginates();
    const key = `${input.tenantId}:${agentExtension}`;
    const pending = this.pendingOriginates.get(key) ?? [];
    pending.push({
      tenantId: input.tenantId,
      agentExtension,
      phoneNumber,
      callerId: input.callerId?.trim() || null,
      customerId: input.customerId?.trim() || null,
      registeredAt: Date.now(),
    });
    this.pendingOriginates.set(key, pending.slice(-5));
  }

  private prunePendingOriginates(now = Date.now()) {
    for (const [key, pending] of this.pendingOriginates.entries()) {
      const fresh = pending.filter((item) => now - item.registeredAt <= PENDING_ORIGINATE_TTL_MS);
      if (fresh.length > 0) {
        this.pendingOriginates.set(key, fresh);
      } else {
        this.pendingOriginates.delete(key);
      }
    }
  }

  private consumePendingOriginateForNewChannel(event: Record<string, any>): PendingOriginate | null {
    const raw = event.raw ?? {};
    const channel = typeof raw.Channel === 'string' ? raw.Channel : '';
    const context = typeof raw.Context === 'string' ? raw.Context : '';
    const exten = typeof raw.Exten === 'string' ? raw.Exten : '';
    const agentExtension =
      context.match(/^agent-phone-(.+)$/)?.[1]
      ?? channel.match(/^PJSIP\/([^-]+)/i)?.[1]
      ?? '';

    if (!agentExtension || context !== `agent-phone-${agentExtension}` || exten !== 's') {
      return null;
    }

    this.prunePendingOriginates();
    const key = `${event.tenantId}:${agentExtension}`;
    const pending = this.pendingOriginates.get(key);
    if (!pending?.length) {
      return null;
    }

    const [next, ...rest] = pending;
    if (rest.length > 0) {
      this.pendingOriginates.set(key, rest);
    } else {
      this.pendingOriginates.delete(key);
    }
    return next;
  }

  /**
   * dedupe 선점을 되돌린다. 해제 자체가 실패해도 원래 예외를 덮지 않도록 삼킨다
   * (Redis 가 죽어서 DB 도 못 쓰는 상황이면 어차피 선점 자체가 안 됐다).
   */
  private async releaseDedupeKey(dedupeKey: string) {
    try {
      await this.redis.getClient().del(dedupeKey);
    } catch (err) {
      this.logger.warn(
        `dedupe key release failed ${dedupeKey}: ${(err as Error).message}`,
      );
    }
  }

  async processNormalizedEvent(
    event: Record<string, any>,
    options: { replay?: boolean } = {},
  ) {
    const linkedid = event.linkedid || event.Linkedid;
    if (!linkedid) return;

    const fingerprint = computeFingerprint(event);
    const dedupeKey = `dedupe:ami:${fingerprint}`;
    let dedupeKeyOwned = false;

    // 1단계: Redis fast dedupe. SET NX EX 로 키를 선점하지 못하면 다른 경로에서
    //        이미 처리한 이벤트이므로 즉시 skip.
    //
    //        replay 는 이 단계를 통째로 건너뛴다. DB 장애 중에는 Redis 만 살아 있어
    //        키 선점은 성공하고 DB insert 만 실패하므로, 선점된 키가 최대 6시간 남아
    //        복구 후 재처리를 전량 차단한다. replay 의 중복 방어는 아래 DB unique 다.
    if (!options.replay) {
      try {
        const ok = await this.redis
          .getClient()
          .set(dedupeKey, '1', 'EX', DEDUPE_TTL_SECONDS, 'NX');
        if (ok !== 'OK') {
          this.logger.debug(`dedupe skip ${event.eventName} fp=${fingerprint.slice(0, 12)}`);
          return;
        }
        dedupeKeyOwned = true;
      } catch (err) {
        // Redis 장애 시에도 DB unique 가 최종 방어선이 되도록 계속 진행.
        this.logger.warn(`redis dedupe failed: ${(err as Error).message}`);
      }
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
        // raw 저장과 세션 상태 전이는 서로 다른 두 번의 쓰기다. 장애 중 raw insert 만
        // 성공하고 상태 전이가 실패한 이벤트가 있을 수 있으므로, replay 는 여기서
        // 멈추지 않고 아래 switch 를 다시 수행한다. 멱등성은 callSessions upsert 와
        // SESSION_PRECEDENCE 역행 가드가 보장한다.
        if (!options.replay) return;
      } else {
        // 이 이벤트를 저장하지 못했으므로 dedupe 선점을 반드시 풀어준다. 풀지 않으면
        // 복구 후 replay 뿐 아니라 정상 경로의 재수신까지 TTL 동안 막힌다.
        if (dedupeKeyOwned) {
          await this.releaseDedupeKey(dedupeKey);
        }
        throw err;
      }
    }

    // 통화 제어(마이크 끄기·끊기·전환·홀드)는 전부 "상담원 쪽 채널"을 찾아야 동작한다.
    // 채널이 실린 이벤트마다 leg 를 남겨 두지 않으면 그 조회가 항상 빈손이 된다.
    await this.trackLeg(event, linkedid);

    switch (event.eventName) {
      case 'Newchannel':
        {
          const pendingOriginate = this.consumePendingOriginateForNewChannel(event);
          await this.ensureSessionStarted(
          linkedid,
          {
              ani: pendingOriginate?.phoneNumber ?? event.ani,
              dnis: pendingOriginate?.callerId ?? event.dnis,
              direction: pendingOriginate ? 'outbound' : 'inbound',
              customerId: pendingOriginate?.customerId ?? undefined,
          },
          event.tenantId,
          );
        }
        break;
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
          {
            sessionStatus: 'RINGING_AGENT',
            ringingAt: new Date(),
            primaryAgentId: await this.resolvePrimaryAgentId(event.agentId, event.tenantId),
          },
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
            primaryAgentId: await this.resolvePrimaryAgentId(event.agentId, event.tenantId),
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
      case 'AgentComplete': {
        const eventAt = event.eventTime ? new Date(event.eventTime) : new Date();
        const raw = event.raw ?? {};
        const talkSeconds = parseNonNegativeSeconds(raw.TalkTime ?? event.talkSeconds);
        const holdSeconds = parseNonNegativeSeconds(raw.HoldTime ?? event.holdSeconds);
        const answeredAt = talkSeconds !== undefined
          ? new Date(eventAt.getTime() - talkSeconds * 1000)
          : undefined;
        const queuedAt = talkSeconds !== undefined && holdSeconds !== undefined
          ? new Date(eventAt.getTime() - (talkSeconds + holdSeconds) * 1000)
          : undefined;

        await this.upsertSession(
          linkedid,
          {
            sessionStatus: 'AFTER_CALL_WORK',
            queueName: event.queueName,
            answeredAt,
            queuedAt,
            talkSeconds,
            holdSeconds,
            primaryAgentId: await this.resolvePrimaryAgentId(
              event.agentId ?? raw.Interface ?? raw.MemberName,
              event.tenantId,
            ),
          },
          event.tenantId,
        );
        break;
      }
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

  private async ensureSessionStarted(
    linkedid: string,
    patch: {
      ani?: string | null;
      dnis?: string | null;
      direction?: string;
      customerId?: string | null;
    },
    tenantId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.callSessions.findFirst({ where: { linkedid, tenantId } });
      const customerId = patch.customerId || await this.resolveCustomerId(tx, tenantId, patch.ani);

      if (!found) {
        const created = await tx.callSessions.create({
          data: {
            tenantId,
            linkedid,
            direction: patch.direction ?? 'inbound',
            sessionStatus: 'NEW',
            ani: patch.ani ?? undefined,
            aniNormalized: normalizePhone(patch.ani ?? ''),
            dnis: patch.dnis ?? undefined,
            customerId: customerId ?? undefined,
            startedAt: new Date(),
          },
        });

        await this.enqueueOutbox(tx, tenantId, REALTIME_EVENTS.CALL_CREATED, created);
        return;
      }

      const data: Prisma.callSessionsUpdateInput = {};
      if (!found.ani && patch.ani) {
        data.ani = patch.ani;
        data.aniNormalized = normalizePhone(patch.ani);
      }
      if (!found.dnis && patch.dnis) {
        data.dnis = patch.dnis;
      }
      if (!found.customerId && customerId) {
        data.customer = {
          connect: {
            customerId,
          },
        };
      }

      if (Object.keys(data).length === 0) {
        return;
      }

      const updated = await tx.callSessions.update({
        where: { callId: found.callId },
        data,
      });

      await this.enqueueOutbox(tx, tenantId, REALTIME_EVENTS.CALL_UPDATED, updated);
    });
  }

  /**
   * 채널 하나를 callLegs 한 줄로 남긴다.
   *
   * 세션이 아직 없으면 아무것도 하지 않는다 — leg 는 세션에 매달리므로, 세션을 만드는
   * 이벤트가 먼저 지나가야 한다. 그 다음 이벤트에서 다시 시도된다.
   *
   * 실패해도 던지지 않는다. leg 기록이 안 됐다고 통화 상태 전이까지 멈추면
   * 화면에서 통화가 통째로 사라진다.
   */
  private async trackLeg(event: any, linkedid: string) {
    const channelName: string | undefined = event?.raw?.Channel || event?.channel;
    const uniqueid: string | undefined = event?.uniqueid || event?.raw?.Uniqueid;
    const legType = classifyLeg(channelName);
    if (!channelName || !uniqueid || !legType) return;

    try {
      const session = await this.prisma.callSessions.findFirst({
        where: { linkedid, tenantId: event.tenantId },
        select: { callId: true },
      });
      if (!session) return;

      const ended = event.eventName === 'Hangup' ? new Date() : undefined;
      const endpoint = getChannelEndpointName(channelName);

      await (this.prisma as any).callLegs.upsert({
        where: { tenantId_uniqueid: { tenantId: event.tenantId, uniqueid } },
        create: {
          tenantId: event.tenantId,
          callId: session.callId,
          linkedid,
          uniqueid,
          legType,
          channelName,
          endpoint,
          stateCode: event?.raw?.ChannelStateDesc,
          startedAt: new Date(),
          endedAt: ended,
        },
        update: {
          channelName,
          endpoint,
          ...(event?.raw?.ChannelStateDesc ? { stateCode: event.raw.ChannelStateDesc } : {}),
          // 이미 끝난 leg 를 되살리지 않는다. 늦게 도착한 이벤트가 endedAt 를 지우면
          // 끝난 통화가 제어 대상으로 다시 잡힌다.
          ...(ended ? { endedAt: ended } : {}),
        },
      });
    } catch (err) {
      this.logger.debug(`leg 기록 실패 ${channelName}: ${(err as Error).message}`);
    }
  }

  private async upsertSession(
    linkedid: string,
    patch: Record<string, any>,
    tenantId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      let found = await tx.callSessions.findFirst({ where: { linkedid, tenantId } });
      const customerId = await this.resolveCustomerId(tx, tenantId, patch.ani);

      if (!found) {
        try {
          const created = await tx.callSessions.create({
            data: {
              tenantId,
              linkedid,
              direction: 'inbound',
              sessionStatus: patch.sessionStatus || 'NEW',
              ani: patch.ani,
              aniNormalized: normalizePhone(patch.ani ?? ''),
              dnis: patch.dnis,
              queueName: patch.queueName,
              customerId: customerId ?? undefined,
              startedAt: new Date(),
              queuedAt: patch.queuedAt,
              ringingAt: patch.ringingAt,
              answeredAt: patch.answeredAt,
              talkSeconds: patch.talkSeconds,
              holdSeconds: patch.holdSeconds,
              primaryAgentId: patch.primaryAgentId,
            },
          });

          await this.enqueueOutbox(tx, tenantId, REALTIME_EVENTS.CALL_CREATED, created);
          return;
        } catch (err) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            this.logger.debug(`session create raced for linkedid=${linkedid}; retrying as update`);
            found = await tx.callSessions.findFirst({ where: { linkedid, tenantId } });
          } else {
            throw err;
          }
        }
      }

      if (!found) {
        this.logger.warn(`session row missing after P2002 retry linkedid=${linkedid}`);
        return;
      }

      // conv 44 역행 가드: 이미 더 진행된 상태면 sessionStatus 필드만 떨어뜨리고
      // timestamps/agent 같은 보조 필드는 그대로 덮어쓴다.
      const { sessionStatus, ani, dnis, ...rest } = patch;
      const data: Prisma.callSessionsUpdateInput = { ...rest };
      if (!found.ani && ani) {
        data.ani = ani;
      }
      if (!found.dnis && dnis) {
        data.dnis = dnis;
      }
      if (!found.customerId && customerId) {
        data.customer = {
          connect: {
            customerId,
          },
        };
      }
      if (!found.aniNormalized && patch.ani) {
        data.aniNormalized = normalizePhone(patch.ani);
      }
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

      await this.enqueueOutbox(tx, tenantId, REALTIME_EVENTS.CALL_UPDATED, updated);
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

      if (found.customerId) {
        await tx.customers.update({
          where: { customerId: found.customerId },
          data: {
            lastCalledAt: endedAt,
          },
        });
      }

      await this.enqueueOutbox(tx, tenantId, REALTIME_EVENTS.CALL_ENDED, updated);
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

      await this.enqueueOutbox(tx, tenantId, REALTIME_EVENTS.CALL_UPDATED, updated);
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

      await this.enqueueOutbox(tx, tenantId, REALTIME_EVENTS.CALL_UPDATED, updated);
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
