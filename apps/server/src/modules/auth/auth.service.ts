import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../common/prisma.service';
import { CallsService } from '../calls/calls.service';
import { EventBusService } from '../events/event-bus.service';
import { QueuesService } from '../queues/queues.service';
import { toRealtimeQueueSummary } from '../queues/realtime-queue-summary.util';
import { RedisService } from '../redis/redis.service';
import { REALTIME_EVENTS } from '../realtime/realtime-events';
import { LoginDto } from './login.dto';

// share 69de045b: access 는 짧게, refresh 는 길게. refresh token 은 평문 저장 금지
// — SHA-256 해시만 DB 에 저장하고 원본은 클라이언트가 보관.
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 14;
const HANDOFF_TOKEN_TTL_SECONDS = 60;
const SUPERVISORY_ROLES = new Set(['supervisor', 'admin']);
type HandoffPurpose = 'desktop' | 'web';

export interface SoftphoneIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface SoftphoneConfigPayload {
  enabled: boolean;
  sipUri: string | null;
  wsServer: string | null;
  authorizationUsername: string | null;
  authorizationPassword?: string | null;
  displayName: string;
  iceServers: SoftphoneIceServer[];
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function generateRefreshTokenValue(): string {
  // 256bit opaque token. JWT 가 아니라 랜덤 문자열이므로 서명 검증 없이
  // 오직 DB 해시 매칭으로만 유효성을 판단한다.
  return randomBytes(32).toString('hex');
}

interface HandoffSessionUser {
  sub: string;
  tenantId: string;
  role: string;
  extension: string;
  sid?: string;
}

interface HandoffPayload {
  purpose: HandoffPurpose;
  agentId: string;
  tenantId: string;
  role: string;
  extension: string;
  deviceName?: string | null;
  redirectPath?: string | null;
}

@Injectable()
export class AuthService {
  private readonly handoffConsumeQueues = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly callsService: CallsService,
    private readonly eventBus: EventBusService,
    private readonly queuesService: QueuesService,
    private readonly redis: RedisService,
  ) {}

  async login(dto: LoginDto, meta?: { userAgent?: string; ipAddress?: string }) {
    const agent = await this.prisma.agents.findFirst({
      where: { loginId: dto.loginId, isActive: true },
    });

    if (!agent) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (dto.extension?.trim()) {
      if (agent.extension !== dto.extension.trim()) {
        throw new UnauthorizedException('Invalid credentials');
      }
    } else if (!SUPERVISORY_ROLES.has(agent.role)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordOk = await bcrypt.compare(dto.password, agent.loginPasswordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.agents.update({
      where: { agentId: agent.agentId },
      data: { lastLoginAt: new Date() },
    });

    // 기존 열린 상태 종료 후 AVAILABLE 설정
    await this.prisma.agentStatusHistory.updateMany({
      where: { agentId: agent.agentId, endedAt: null },
      data: { endedAt: new Date() },
    });
    await this.prisma.agentStatusHistory.create({
      data: {
        tenantId: agent.tenantId,
        agentId: agent.agentId,
        statusCode: 'AVAILABLE' as any,
        startedAt: new Date(),
      },
    });

    await this.eventBus.publish(REALTIME_EVENTS.AGENT_STATUS_CHANGED, {
      agentId: agent.agentId,
      statusCode: 'AVAILABLE',
      reasonCode: null,
    });
    const queueSummary = await this.queuesService.getSummary(agent.tenantId);
    await this.eventBus.publish(
      REALTIME_EVENTS.QUEUE_SUMMARY_UPDATED,
      toRealtimeQueueSummary(queueSummary.data?.queues ?? []),
    );

    const refreshToken = await this.issueRefreshToken(agent.agentId, agent.tenantId, meta);
    const accessToken = this.signAccessToken(agent, {
      sessionId: sha256(refreshToken),
    });

    return {
      success: true,
      data: {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: 900, // 15 min
        agent: {
          agentId: agent.agentId,
          agentName: agent.agentName,
          extension: agent.extension,
          role: agent.role,
        },
        softphoneConfig: dto.clientType === 'desktop'
          ? await this.buildDesktopSoftphoneConfig(agent)
          : this.buildSoftphoneConfig(agent),
      },
      error: null,
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const tokenHash = sha256(refreshToken);
    const row = await this.prisma.refreshTokens.findUnique({
      where: { tokenHash },
      include: { agent: true },
    });

    if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const agent = row.agent;
    if (!agent?.isActive) {
      throw new UnauthorizedException('Agent inactive');
    }

    // 보안: refresh token 회전. 재사용 공격 방지.
    await this.prisma.refreshTokens.update({
      where: { refreshTokenId: row.refreshTokenId },
      data: { revokedAt: new Date() },
    });

    const newRefreshToken = await this.issueRefreshToken(
      agent.agentId,
      agent.tenantId,
      { userAgent: row.userAgent ?? undefined, ipAddress: row.ipAddress ?? undefined },
    );
    const newAccessToken = this.signAccessToken(agent, {
      sessionId: sha256(newRefreshToken),
    });

    return {
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenType: 'Bearer',
        expiresIn: 900,
        agent: {
          agentId: agent.agentId,
          agentName: agent.agentName,
          extension: agent.extension,
          role: agent.role,
        },
        softphoneConfig: this.buildSoftphoneConfig(agent),
      },
      error: null,
    };
  }

  async logout(refreshToken: string) {
    if (!refreshToken) {
      // 멱등: 토큰이 없어도 성공 취급.
      return { success: true, data: { loggedOut: true }, error: null };
    }
    const tokenHash = sha256(refreshToken);
    const row = await this.prisma.refreshTokens.findUnique({
      where: { tokenHash },
      select: { agentId: true, tenantId: true },
    });
    await this.prisma.refreshTokens.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (row?.agentId) {
      await this.prisma.agentStatusHistory.updateMany({
        where: { agentId: row.agentId, endedAt: null },
        data: { endedAt: new Date() },
      });
      const queueSummary = await this.queuesService.getSummary(row.tenantId);
      await this.eventBus.publish(
        REALTIME_EVENTS.QUEUE_SUMMARY_UPDATED,
        toRealtimeQueueSummary(queueSummary.data?.queues ?? []),
      );
    }
    return { success: true, data: { loggedOut: true }, error: null };
  }

  async logoutAll(agentId: string) {
    await this.prisma.refreshTokens.updateMany({
      where: { agentId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true, data: { loggedOut: true }, error: null };
  }

  async getSession(user: any) {
    const agent = await this.prisma.agents.findUnique({
      where: { agentId: user.sub },
      select: {
        agentId: true,
        tenantId: true,
        agentName: true,
        extension: true,
        role: true,
        defaultQueue: true,
      },
    });
    const outboundDialOptions = await this.callsService.getOutboundDialOptions(user.tenantId);

    return {
      success: true,
      data: {
        agent,
        callControlCapabilities: this.callsService.getCallControlCapabilities(),
        outboundDialOptions,
        softphoneConfig: this.buildSoftphoneConfig(agent),
      },
      error: null,
    };
  }

  async createDesktopHandoff(
    user: HandoffSessionUser,
    dto?: { deviceName?: string },
  ) {
    await this.assertDesktopCapableSession(user);
    const handoffToken = randomBytes(24).toString('hex');
    await this.storeHandoffToken('desktop', handoffToken, {
      purpose: 'desktop',
      agentId: user.sub,
      tenantId: user.tenantId,
      role: user.role,
      extension: user.extension,
      deviceName: dto?.deviceName ?? null,
    });

    return {
      success: true,
      data: {
        handoffToken,
        expiresIn: HANDOFF_TOKEN_TTL_SECONDS,
      },
      error: null,
    };
  }

  async createWebHandoff(
    user: HandoffSessionUser,
    dto?: { redirectPath?: string },
  ) {
    await this.assertDesktopCapableSession(user);
    const handoffToken = randomBytes(24).toString('hex');
    await this.storeHandoffToken('web', handoffToken, {
      purpose: 'web',
      agentId: user.sub,
      tenantId: user.tenantId,
      role: user.role,
      extension: user.extension,
      // redirectPath is intentionally part of the web handoff payload so the
      // browser entry flow can resume in the right place after exchange.
      redirectPath: dto?.redirectPath?.trim() || '/desktop-handoff',
    });

    return {
      success: true,
      data: {
        handoffToken,
        expiresIn: HANDOFF_TOKEN_TTL_SECONDS,
      },
      error: null,
    };
  }

  async exchangeDesktopHandoff(handoffToken: string) {
    if (!handoffToken) {
      throw new UnauthorizedException('Invalid or expired handoff token');
    }

    const raw = await this.consumeHandoffToken('desktop', handoffToken);
    if (!raw) {
      throw new UnauthorizedException('Invalid or expired handoff token');
    }

    const payload = this.parseHandoffPayload(raw, 'desktop');

    const agent = await this.prisma.agents.findUnique({
      where: { agentId: payload.agentId },
    });
    if (!agent || !agent.isActive || agent.tenantId !== payload.tenantId) {
      throw new UnauthorizedException('Invalid or expired handoff token');
    }

    const refreshToken = await this.issueRefreshToken(agent.agentId, agent.tenantId, {
      userAgent: 'desktop-handoff',
      ipAddress: 'handoff',
    });
    const accessToken = this.signAccessToken(agent, {
      sessionId: sha256(refreshToken),
    });

    return {
      success: true,
      data: {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: 900,
        agent: {
          agentId: agent.agentId,
          agentName: agent.agentName,
          extension: agent.extension,
          role: agent.role,
        },
      },
      error: null,
    };
  }

  async exchangeWebHandoff(handoffToken: string) {
    if (!handoffToken) {
      throw new UnauthorizedException('Invalid or expired handoff token');
    }

    const raw = await this.consumeHandoffToken('web', handoffToken);
    if (!raw) {
      throw new UnauthorizedException('Invalid or expired handoff token');
    }

    const payload = this.parseHandoffPayload(raw, 'web');

    const agent = await this.prisma.agents.findUnique({
      where: { agentId: payload.agentId },
    });
    if (!agent || !agent.isActive || agent.tenantId !== payload.tenantId) {
      throw new UnauthorizedException('Invalid or expired handoff token');
    }

    const refreshToken = await this.issueRefreshToken(agent.agentId, agent.tenantId, {
      userAgent: 'web-handoff',
      ipAddress: 'handoff',
    });
    const accessToken = this.signAccessToken(agent, {
      sessionId: sha256(refreshToken),
    });

    return {
      success: true,
      data: {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: 900,
        agent: {
          agentId: agent.agentId,
          agentName: agent.agentName,
          extension: agent.extension,
          role: agent.role,
        },
      },
      error: null,
    };
  }

  async getDesktopSession(user: any) {
    const agent = await this.prisma.agents.findFirst({
      where: {
        agentId: user.sub,
        tenantId: user.tenantId,
        isActive: true,
      },
      select: {
        agentId: true,
        tenantId: true,
        agentName: true,
        extension: true,
        role: true,
        sipPassword: true,
      },
    });

    if (!agent) {
      throw new UnauthorizedException('Invalid desktop session');
    }

    return {
      success: true,
      data: {
        agent: {
          agentId: agent.agentId,
          agentName: agent.agentName,
          extension: agent.extension,
          role: agent.role,
        },
        softphoneConfig: await this.buildDesktopSoftphoneConfig(agent),
      },
      error: null,
    };
  }

  private signAccessToken(agent: {
    agentId: string;
    role: string;
    extension: string;
    tenantId: string;
  }, options?: { sessionId?: string }): string {
    return jwt.sign(
      {
        sub: agent.agentId,
        role: agent.role,
        extension: agent.extension,
        tenantId: agent.tenantId,
        ...(options?.sessionId ? { sid: options.sessionId } : {}),
      },
      this.config.get<string>('JWT_SECRET', 'change_me'),
      { expiresIn: ACCESS_TOKEN_TTL },
    );
  }

  private async issueRefreshToken(
    agentId: string,
    tenantId: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<string> {
    const value = generateRefreshTokenValue();
    const tokenHash = sha256(value);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.refreshTokens.create({
      data: {
        tenantId,
        agentId,
        tokenHash,
        expiresAt,
        userAgent: meta?.userAgent ?? null,
        ipAddress: meta?.ipAddress ?? null,
      },
    });
    return value;
  }

  private handoffKey(purpose: HandoffPurpose, token: string) {
    return `kaster:auth:handoff:${purpose}:${sha256(token)}`;
  }

  private async storeHandoffToken(
    purpose: HandoffPurpose,
    token: string,
    payload: HandoffPayload,
  ) {
    await this.redis.getClient().set(
      this.handoffKey(purpose, token),
      JSON.stringify(payload),
      'EX',
      HANDOFF_TOKEN_TTL_SECONDS,
    );
  }

  private buildSoftphoneConfig(
    agent?: { extension?: string | null; agentName?: string | null; sipPassword?: string | null } | null,
    options?: { includeCredential?: boolean },
  ): SoftphoneConfigPayload {
    const enabled = this.config.get<string>('SOFTPHONE_ENABLED', 'false') === 'true';
    const sipDomain = this.config.get<string>('SOFTPHONE_SIP_DOMAIN', '').trim();
    const wsServer = this.config.get<string>('SOFTPHONE_WS_SERVER', '').trim();
    const extension = agent?.extension?.trim() ?? null;
    const displayName = agent?.agentName?.trim() || 'Unknown Agent';

    if (!enabled || !sipDomain || !wsServer || !extension) {
      return {
        enabled: false,
        sipUri: null,
        wsServer: null,
        authorizationUsername: null,
        authorizationPassword: options?.includeCredential ? null : undefined,
        displayName,
        iceServers: [],
      };
    }

    return {
      enabled: true,
      sipUri: `sip:${extension}@${sipDomain}`,
      wsServer,
      authorizationUsername: extension,
      authorizationPassword: options?.includeCredential ? agent?.sipPassword?.trim() ?? null : undefined,
      displayName,
      iceServers: this.parseIceServers(),
    };
  }

  private async buildDesktopSoftphoneConfig(
    agent?: {
      tenantId?: string | null;
      extension?: string | null;
      agentName?: string | null;
      sipPassword?: string | null;
    } | null,
  ): Promise<SoftphoneConfigPayload> {
    const defaultSipPassword = agent?.tenantId
      ? (await this.prisma.tenantSystemSettings.findUnique({
          where: { tenantId: agent.tenantId },
          select: { defaultSipPassword: true },
        }))?.defaultSipPassword ?? null
      : null;

    return this.buildSoftphoneConfig(
      {
        ...agent,
        sipPassword: agent?.sipPassword?.trim() || defaultSipPassword,
      },
      { includeCredential: true },
    );
  }

  private parseIceServers(): SoftphoneIceServer[] {
    const raw = this.config.get<string>('SOFTPHONE_ICE_SERVERS_JSON', '[]');
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter((entry): entry is SoftphoneIceServer => {
        if (!entry || typeof entry !== 'object' || !('urls' in entry)) {
          return false;
        }

        const candidate = entry as Record<string, unknown>;
        return typeof candidate.urls === 'string'
          || (Array.isArray(candidate.urls) && candidate.urls.every((item) => typeof item === 'string'));
      });
    } catch {
      return [];
    }
  }

  private parseHandoffPayload(raw: string, expectedPurpose: HandoffPurpose): HandoffPayload {
    try {
      const payload = JSON.parse(raw) as HandoffPayload;
      if (
        !payload
        || payload.purpose !== expectedPurpose
        || !payload.agentId
        || !payload.tenantId
        || !payload.role
        || !payload.extension
      ) {
        throw new Error('invalid payload');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired handoff token');
    }
  }

  private async assertDesktopCapableSession(user: HandoffSessionUser) {
    if (!user.sid) {
      throw new UnauthorizedException('Invalid or expired handoff token');
    }

    const activeSession = await this.prisma.refreshTokens.findUnique({
      where: {
        tokenHash: user.sid,
      },
      select: {
        refreshTokenId: true,
        agentId: true,
        tenantId: true,
        revokedAt: true,
        expiresAt: true,
      },
    });
    if (
      !activeSession
      || activeSession.agentId !== user.sub
      || activeSession.tenantId !== user.tenantId
      || activeSession.revokedAt
      || activeSession.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Invalid or expired handoff token');
    }
  }

  private async consumeHandoffToken(purpose: HandoffPurpose, handoffToken: string): Promise<string | null> {
    const key = this.handoffKey(purpose, handoffToken);
    const client = this.redis.getClient() as {
      getdel?: (key: string) => Promise<string | null>;
      eval?: (script: string, keyCount: number, ...args: string[]) => Promise<string | null>;
      call?: (command: string, key: string) => Promise<string | null>;
      get: (key: string) => Promise<string | null>;
      del: (key: string) => Promise<number>;
    };

    if (typeof client.getdel === 'function') {
      return client.getdel(key);
    }

    if (typeof client.eval === 'function') {
      return client.eval(
        "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value;",
        1,
        key,
      );
    }

    if (typeof client.call === 'function') {
      return client.call('GETDEL', key);
    }

    return this.consumeHandoffTokenWithLock(key, client);
  }

  private async consumeHandoffTokenWithLock(
    key: string,
    client: {
      get: (key: string) => Promise<string | null>;
      del: (key: string) => Promise<number>;
    },
  ): Promise<string | null> {
    const previous = this.handoffConsumeQueues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queueTail = previous.then(() => current);
    this.handoffConsumeQueues.set(key, queueTail);

    await previous;
    try {
      const raw = await client.get(key);
      if (!raw) {
        return null;
      }
      const deleted = await client.del(key);
      return deleted === 1 ? raw : null;
    } finally {
      release();
      if (this.handoffConsumeQueues.get(key) === queueTail) {
        this.handoffConsumeQueues.delete(key);
      }
    }
  }

  /**
   * 상담원 본인 — JWT 의 sub 기반으로 발신 가능한 callerId 권한 목록 조회.
   * apps/web · apps/desktop 발신 UI 가 이 응답을 토대로 발신번호 선택 옵션을 표시한다.
   * agents-by-id 경로에 본인+감독 분기를 두는 대신 본인 전용 endpoint 로 분리해
   * agents.controller 의 `user.sub !== agentId && !SUPERVISORY_ROLES.has(user.role)` 류 인라인 분기를 피함.
   */
  async listMyCallerIdPermissions(user: { tenantId: string; sub: string }) {
    const rows = await (this.prisma as any).agentBranchCallerIds.findMany({
      where: { tenantId: user.tenantId, agentId: user.sub },
      include: {
        branch: { select: { branchId: true, branchCode: true, branchName: true } },
      },
      orderBy: [{ branchId: 'asc' }, { sortOrder: 'asc' }],
    });
    return { success: true, data: rows, error: null };
  }
}
