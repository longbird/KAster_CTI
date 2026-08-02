import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../redis/redis.service';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const SECURITY_EVENT_NAMES = new Set([
  'FailedACL',
  'InvalidAccountID',
  'ChallengeResponseFailed',
  'InvalidPassword',
  'AuthMethodNotAllowed',
  'RequestNotAllowed',
]);

export interface SipSecuritySignal {
  tenantId: string;
  sourceIp: string | null;
  sourceNumber: string | null;
  targetNumber: string | null;
  eventName: string;
  securityEvent: string | null;
  raw: Record<string, unknown>;
}

interface BlockInput {
  tenantId: string;
  blockType: 'NUMBER' | 'IP';
  value: string;
  reason: string;
  blockedSeconds: number;
  signal: SipSecuritySignal;
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

function numberCandidate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const sipUser = /sip:([^@;>\s]+)/i.exec(trimmed)?.[1];
  const digits = digitsOnly(sipUser ?? trimmed);
  return digits.length >= 2 && digits.length <= 32 ? digits : null;
}

function ipCandidate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const remoteMatch = /^IPV[46]\/(?:UDP|TCP|TLS)\/(.+)\/\d+$/i.exec(trimmed);
  const candidate = remoteMatch?.[1] ?? trimmed;
  if (!/^[0-9a-fA-F:.]+$/.test(candidate)) return null;
  return candidate;
}

export function extractSipSecuritySignal(event: Record<string, any>): SipSecuritySignal | null {
  const raw = event.raw && typeof event.raw === 'object' && !Array.isArray(event.raw)
    ? event.raw as Record<string, unknown>
    : event;
  const eventName = String(event.eventName ?? raw.Event ?? '').trim();
  const securityEvent = typeof raw.SecurityEvent === 'string' ? raw.SecurityEvent.trim() : null;

  if (eventName !== 'SecurityEvent' && !securityEvent) {
    return null;
  }
  if (securityEvent && !SECURITY_EVENT_NAMES.has(securityEvent)) {
    return null;
  }

  const sourceIp = ipCandidate(raw.RemoteAddress ?? raw.RemoteAddr ?? raw.Address ?? raw.RemoteIP);
  const sourceNumber = numberCandidate(
    raw.AccountID
      ?? raw.Username
      ?? raw.CallerIDNum
      ?? raw.CallerID
      ?? raw.From
      ?? raw.Contact,
  );
  const targetNumber = numberCandidate(
    raw.Exten
      ?? raw.Extension
      ?? raw.To
      ?? raw.RequestURI
      ?? raw.URI
      ?? raw.DNID
      ?? raw.DNIS,
  );

  if (!sourceIp && !sourceNumber && !targetNumber) {
    return null;
  }

  return {
    tenantId: String(event.tenantId ?? raw.TenantId ?? DEFAULT_TENANT_ID),
    sourceIp,
    sourceNumber,
    targetNumber,
    eventName,
    securityEvent,
    raw,
  };
}

@Injectable()
export class SipSecurityService {
  private readonly logger = new Logger(SipSecurityService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async processAmiEvent(event: Record<string, any>) {
    if (this.config.get<string>('SIP_SECURITY_ENABLED', 'true') === 'false') {
      return;
    }

    const signal = extractSipSecuritySignal(event);
    if (!signal) return;

    try {
      await this.applySignal(signal);
    } catch (error) {
      this.logger.warn(`SIP security detector skipped event: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async listBlocks(
    tenantId: string,
    options?: { includeExpired?: boolean; limit?: number },
  ) {
    const now = new Date();
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
    return this.prisma.sipSecurityBlocks.findMany({
      where: {
        tenantId,
        ...(options?.includeExpired ? {} : { blockedUntil: { gt: now } }),
      },
      orderBy: [{ blockedUntil: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });
  }

  private async applySignal(signal: SipSecuritySignal) {
    if (signal.sourceNumber) {
      const count = await this.incrementWindow(
        `number:${signal.tenantId}:${signal.sourceNumber}`,
        this.numberWindowSeconds,
      );
      if (count >= this.numberThreshold) {
        await this.upsertBlock({
          tenantId: signal.tenantId,
          blockType: 'NUMBER',
          value: signal.sourceNumber,
          reason: 'SIP_NUMBER_ABUSE',
          blockedSeconds: this.numberBlockSeconds,
          signal,
        });
      }
    }

    if (!signal.sourceIp) return;

    const ipCount = await this.incrementWindow(
      `ip:${signal.sourceIp}`,
      this.ipWindowSeconds,
    );
    const distinctNumberCount = await this.trackDistinctIpNumber(signal);

    if (ipCount >= this.ipThreshold || distinctNumberCount >= this.ipDistinctNumberThreshold) {
      await this.upsertBlock({
        tenantId: signal.tenantId,
        blockType: 'IP',
        value: signal.sourceIp,
        reason: distinctNumberCount >= this.ipDistinctNumberThreshold
          ? 'SIP_IP_NUMBER_ROTATION'
          : 'SIP_IP_ABUSE',
        blockedSeconds: this.ipBlockSeconds,
        signal,
      });
    }
  }

  private async trackDistinctIpNumber(signal: SipSecuritySignal) {
    const marker = signal.sourceNumber ?? signal.targetNumber;
    if (!signal.sourceIp || !marker) return 0;
    const key = this.key(`ip-numbers:${signal.sourceIp}`);
    const client = this.redis.getClient();
    await client.sadd(key, marker);
    await client.expire(key, this.ipWindowSeconds);
    return client.scard(key);
  }

  private async incrementWindow(name: string, windowSeconds: number) {
    const key = this.key(name);
    const client = this.redis.getClient();
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, windowSeconds);
    }
    return count;
  }

  private async upsertBlock(input: BlockInput) {
    const blockKey = `${input.blockType}:${input.value}`;
    const blockedUntil = new Date(Date.now() + input.blockedSeconds * 1000);
    const metadata = {
      eventName: input.signal.eventName,
      securityEvent: input.signal.securityEvent,
      observedAt: new Date().toISOString(),
    };

    await this.prisma.sipSecurityBlocks.upsert({
      where: {
        tenantId_blockKey: {
          tenantId: input.tenantId,
          blockKey,
        },
      },
      create: {
        tenantId: input.tenantId,
        blockType: input.blockType,
        blockKey,
        value: input.value,
        reason: input.reason,
        sourceIp: input.signal.sourceIp,
        sourceNumber: input.signal.sourceNumber,
        targetNumber: input.signal.targetNumber,
        hitCount: 1,
        blockedUntil,
        metadata,
      },
      update: {
        reason: input.reason,
        sourceIp: input.signal.sourceIp,
        sourceNumber: input.signal.sourceNumber,
        targetNumber: input.signal.targetNumber,
        hitCount: { increment: 1 },
        blockedUntil,
        metadata,
      },
    });
  }

  private key(name: string) {
    return `kaster:cti:sip-security:${name}`;
  }

  private get numberWindowSeconds() {
    return this.positiveInt('SIP_SECURITY_NUMBER_WINDOW_SECONDS', 60);
  }

  private get numberThreshold() {
    return this.positiveInt('SIP_SECURITY_NUMBER_THRESHOLD', 5);
  }

  private get numberBlockSeconds() {
    return this.positiveInt('SIP_SECURITY_NUMBER_BLOCK_SECONDS', 600);
  }

  private get ipWindowSeconds() {
    return this.positiveInt('SIP_SECURITY_IP_WINDOW_SECONDS', 60);
  }

  private get ipThreshold() {
    return this.positiveInt('SIP_SECURITY_IP_THRESHOLD', 15);
  }

  private get ipDistinctNumberThreshold() {
    return this.positiveInt('SIP_SECURITY_IP_DISTINCT_NUMBER_THRESHOLD', 5);
  }

  private get ipBlockSeconds() {
    return this.positiveInt('SIP_SECURITY_IP_BLOCK_SECONDS', 3600);
  }

  private positiveInt(key: string, fallback: number) {
    const value = Number(this.config.get<string>(key, String(fallback)));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
