import { Test, TestingModule } from '@nestjs/testing';
import { AgentUpdatesService } from '../src/modules/agent-updates/agent-updates.service';
import { PrismaService } from '../src/common/prisma.service';
import { RedisService } from '../src/modules/redis/redis.service';

describe('AgentUpdatesService manifest', () => {
  let service: AgentUpdatesService;
  const prisma = {
    agentDesktopReleases: {
      findFirst: jest.fn(),
    },
    agentDesktopUpdateAuditLogs: {
      create: jest.fn(),
    },
  };
  const redis = {
    getClient: () => ({
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentUpdatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(AgentUpdatesService);
  });

  it('getManifest 는 tenant 별 최신 승인 릴리스를 반환한다', async () => {
    prisma.agentDesktopReleases.findFirst.mockResolvedValue({
      releaseId: 'release-1',
      tenantId: 'tenant-1',
      channel: 'stable',
      version: '1.4.0',
      artifactId: 'agent-win-x64-1.4.0',
      fileName: 'KAsterAgent-1.4.0-Setup.exe',
      filePath: 'D:/agent-updates/KAsterAgent-1.4.0-Setup.exe',
      fileSizeBytes: BigInt(85423104),
      sha256: 'abc123',
      mandatory: false,
      minimumRequiredVersion: '1.2.8',
      minimumServerVersion: '0.9.0',
      maximumServerVersion: '0.9.x',
      notes: '음소거/보류 안정성 개선',
      publishedAt: new Date('2026-04-22T02:00:00.000Z'),
    });

    const result = await service.getManifest({
      tenantId: 'tenant-1',
      currentVersion: '1.3.2',
      channel: 'stable',
    });

    expect(prisma.agentDesktopReleases.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        channel: 'stable',
        isActive: true,
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
    expect(result).toEqual({
      success: true,
      data: {
        centerId: 'tenant-1',
        channel: 'stable',
        currentVersion: '1.3.2',
        latestVersion: '1.4.0',
        mandatory: false,
        minimumRequiredVersion: '1.2.8',
        serverCompatibility: {
          minimumServerVersion: '0.9.0',
          maximumServerVersion: '0.9.x',
        },
        artifacts: [
          {
            artifactId: 'agent-win-x64-1.4.0',
            version: '1.4.0',
            fileName: 'KAsterAgent-1.4.0-Setup.exe',
            size: 85423104,
            sha256: 'abc123',
          },
        ],
        notes: '음소거/보류 안정성 개선',
      },
      error: null,
    });
  });

  it('createUpdateSession 은 짧은 수명 update session token 을 Redis 에 저장한다', async () => {
    const redisSet = jest.fn().mockResolvedValue('OK');
    (redis.getClient as unknown as jest.Mock) = jest.fn(() => ({
      set: redisSet,
      get: jest.fn(),
      del: jest.fn(),
    }));

    const result = await service.createUpdateSession(
      {
        sub: 'agent-1',
        tenantId: 'tenant-1',
        role: 'agent',
      },
      {
        deviceId: 'pc-001',
        currentVersion: '1.3.2',
      },
      '203.0.113.10',
    );

    expect(result.success).toBe(true);
    expect(result.data.expiresIn).toBe(600);
    expect(result.data.updateSessionToken).toEqual(expect.any(String));
    expect(redisSet).toHaveBeenCalledWith(
      expect.stringMatching(/^kaster:agent-updates:session:/),
      expect.stringContaining('"deviceId":"pc-001"'),
      'EX',
      600,
    );
  });

  it('initDownload 은 artifact 범위의 1회성 download token 을 발급하고 consumeDownloadToken 으로 1회만 소비된다', async () => {
    const redisStore = new Map<string, string>();
    (redis.getClient as unknown as jest.Mock) = jest.fn(() => ({
      set: jest.fn(async (key: string, value: string) => {
        redisStore.set(key, value);
        return 'OK';
      }),
      get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
      del: jest.fn(async (key: string) => {
        const existed = redisStore.has(key);
        redisStore.delete(key);
        return existed ? 1 : 0;
      }),
    }));

    prisma.agentDesktopReleases.findFirst.mockResolvedValue({
      releaseId: 'release-1',
      tenantId: 'tenant-1',
      channel: 'stable',
      version: '1.4.0',
      artifactId: 'agent-win-x64-1.4.0',
      fileName: 'KAsterAgent-1.4.0-Setup.exe',
      filePath: 'D:/agent-updates/KAsterAgent-1.4.0-Setup.exe',
      fileSizeBytes: BigInt(85423104),
      sha256: 'abc123',
      mandatory: false,
      minimumRequiredVersion: '1.2.8',
      minimumServerVersion: '0.9.0',
      maximumServerVersion: '0.9.x',
      notes: '음소거/보류 안정성 개선',
      publishedAt: new Date('2026-04-22T02:00:00.000Z'),
      isActive: true,
      createdAt: new Date('2026-04-22T02:00:00.000Z'),
      updatedAt: new Date('2026-04-22T02:00:00.000Z'),
    });

    const result = await service.initDownload(
      {
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        deviceId: 'pc-001',
      },
      {
        artifactId: 'agent-win-x64-1.4.0',
        currentVersion: '1.3.2',
      },
      '203.0.113.10',
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        artifactId: 'agent-win-x64-1.4.0',
        version: '1.4.0',
        expiresIn: 120,
        sha256: 'abc123',
      },
      error: null,
    });
    expect(result.data.downloadToken).toEqual(expect.any(String));

    const consumed = await service.consumeDownloadToken(result.data.downloadToken);

    expect(consumed).toMatchObject({
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      deviceId: 'pc-001',
      artifactId: 'agent-win-x64-1.4.0',
      version: '1.4.0',
      clientIp: '203.0.113.10',
    });
    await expect(service.consumeDownloadToken(result.data.downloadToken)).rejects.toThrow(
      'Invalid or expired download token',
    );
  });
});
