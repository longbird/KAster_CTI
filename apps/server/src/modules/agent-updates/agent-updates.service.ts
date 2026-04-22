import { UnauthorizedException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../redis/redis.service';

const UPDATE_SESSION_TTL_SECONDS = 600;
const DOWNLOAD_TOKEN_TTL_SECONDS = 120;

@Injectable()
export class AgentUpdatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async createUpdateSession(
    user: { sub: string; tenantId: string; role: string },
    dto: { deviceId?: string; currentVersion?: string },
    clientIp?: string,
  ) {
    const token = randomBytes(24).toString('hex');

    await this.redis.getClient().set(
      this.sessionKey(token),
      JSON.stringify({
        tenantId: user.tenantId,
        agentId: user.sub,
        role: user.role,
        deviceId: dto.deviceId ?? null,
        currentVersion: dto.currentVersion ?? null,
        clientIp: clientIp ?? null,
      }),
      'EX',
      UPDATE_SESSION_TTL_SECONDS,
    );

    return {
      success: true,
      data: {
        updateSessionToken: token,
        expiresIn: UPDATE_SESSION_TTL_SECONDS,
      },
      error: null,
    };
  }

  async validateUpdateSessionToken(token: string) {
    if (!token) {
      throw new UnauthorizedException('Invalid or expired update session token');
    }

    const raw = await this.redis.getClient().get(this.sessionKey(token));
    if (!raw) {
      throw new UnauthorizedException('Invalid or expired update session token');
    }

    try {
      return JSON.parse(raw) as {
        tenantId: string;
        agentId: string;
        role: string;
        deviceId?: string | null;
        currentVersion?: string | null;
        clientIp?: string | null;
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired update session token');
    }
  }

  async getManifest(params: {
    tenantId: string;
    currentVersion: string;
    channel?: string;
  }) {
    const release = await this.prisma.agentDesktopReleases.findFirst({
      where: {
        tenantId: params.tenantId,
        channel: params.channel ?? 'stable',
        isActive: true,
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!release) {
      return {
        success: true,
        data: null,
        error: null,
      };
    }

    return {
      success: true,
      data: {
        centerId: params.tenantId,
        channel: release.channel,
        currentVersion: params.currentVersion,
        latestVersion: release.version,
        mandatory: release.mandatory,
        minimumRequiredVersion: release.minimumRequiredVersion,
        serverCompatibility: {
          minimumServerVersion: release.minimumServerVersion,
          maximumServerVersion: release.maximumServerVersion,
        },
        artifacts: [
          {
            artifactId: release.artifactId,
            version: release.version,
            fileName: release.fileName,
            size: Number(release.fileSizeBytes ?? 0),
            sha256: release.sha256,
          },
        ],
        notes: release.notes,
      },
      error: null,
    };
  }

  async initDownload(
    session: { tenantId: string; agentId: string; deviceId?: string | null },
    dto: { artifactId: string; currentVersion: string },
    clientIp?: string,
  ) {
    const release = await this.prisma.agentDesktopReleases.findFirst({
      where: {
        tenantId: session.tenantId,
        artifactId: dto.artifactId,
        isActive: true,
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!release) {
      throw new NotFoundException('Approved desktop release not found');
    }

    const token = randomBytes(24).toString('hex');
    await this.redis.getClient().set(
      this.downloadKey(token),
      JSON.stringify({
        tenantId: session.tenantId,
        agentId: session.agentId,
        deviceId: session.deviceId ?? null,
        artifactId: release.artifactId,
        version: release.version,
        currentVersion: dto.currentVersion,
        clientIp: clientIp ?? null,
      }),
      'EX',
      DOWNLOAD_TOKEN_TTL_SECONDS,
    );

    return {
      success: true,
      data: {
        artifactId: release.artifactId,
        version: release.version,
        downloadUrl: `/agent-updates/artifacts/${release.artifactId}`,
        downloadToken: token,
        expiresIn: DOWNLOAD_TOKEN_TTL_SECONDS,
        sha256: release.sha256,
      },
      error: null,
    };
  }

  async consumeDownloadToken(token: string) {
    if (!token) {
      throw new UnauthorizedException('Invalid or expired download token');
    }

    const raw = await this.consumeOnce(this.downloadKey(token));
    if (!raw) {
      throw new UnauthorizedException('Invalid or expired download token');
    }

    try {
      return JSON.parse(raw) as {
        tenantId: string;
        agentId: string;
        deviceId?: string | null;
        artifactId: string;
        version: string;
        currentVersion?: string | null;
        clientIp?: string | null;
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired download token');
    }
  }

  async findArtifact(params: { tenantId: string; artifactId: string }) {
    return this.prisma.agentDesktopReleases.findFirst({
      where: {
        tenantId: params.tenantId,
        artifactId: params.artifactId,
        isActive: true,
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async recordAudit(params: {
    tenantId: string;
    agentId?: string | null;
    deviceId?: string | null;
    clientIp?: string | null;
    currentAppVersion?: string | null;
    targetVersion?: string | null;
    artifactId?: string | null;
    eventType: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.prisma.agentDesktopUpdateAuditLogs.create({
      data: {
        tenantId: params.tenantId,
        agentId: params.agentId ?? null,
        deviceId: params.deviceId ?? null,
        clientIp: params.clientIp ?? null,
        currentAppVersion: params.currentAppVersion ?? null,
        targetVersion: params.targetVersion ?? null,
        artifactId: params.artifactId ?? null,
        eventType: params.eventType,
        metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private sessionKey(token: string) {
    return `kaster:agent-updates:session:${this.sha256(token)}`;
  }

  private downloadKey(token: string) {
    return `kaster:agent-updates:download:${this.sha256(token)}`;
  }

  private sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private async consumeOnce(key: string): Promise<string | null> {
    const client = this.redis.getClient() as {
      getdel?: (redisKey: string) => Promise<string | null>;
      call?: (command: string, redisKey: string) => Promise<string | null>;
      get: (redisKey: string) => Promise<string | null>;
      del: (redisKey: string) => Promise<number>;
    };

    if (typeof client.getdel === 'function') {
      return client.getdel(key);
    }

    if (typeof client.call === 'function') {
      return client.call('GETDEL', key);
    }

    const raw = await client.get(key);
    if (!raw) {
      return null;
    }

    const deleted = await client.del(key);
    return deleted === 1 ? raw : null;
  }
}
