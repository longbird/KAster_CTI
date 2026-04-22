import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/common/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { CallsService } from '../src/modules/calls/calls.service';
import { EventBusService } from '../src/modules/events/event-bus.service';
import { QueuesService } from '../src/modules/queues/queues.service';
import { RedisService } from '../src/modules/redis/redis.service';

describe('AuthService desktop handoff', () => {
  let service: AuthService;
  const redisStore = new Map<string, string>();
  const redisClient = {
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
  };
  const prisma = {
    agents: {
      findUnique: jest.fn(),
    },
    refreshTokens: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    redisStore.clear();
    jest.clearAllMocks();
    prisma.agents.findUnique.mockResolvedValue({
      agentId: 'agent-1',
      agentName: '상담원1',
      extension: '1001',
      role: 'agent',
      tenantId: 'tenant-1',
      isActive: true,
    });
    prisma.refreshTokens.findUnique.mockResolvedValue({
      refreshTokenId: 'rt-1',
      agentId: 'agent-1',
      tenantId: 'tenant-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('change_me') } },
        {
          provide: CallsService,
          useValue: { getOutboundDialOptions: jest.fn(), getCallControlCapabilities: jest.fn() },
        },
        { provide: EventBusService, useValue: { publish: jest.fn() } },
        { provide: QueuesService, useValue: { getSummary: jest.fn() } },
        { provide: RedisService, useValue: { getClient: () => redisClient } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('createDesktopHandoff 와 exchangeDesktopHandoff 는 토큰을 1회만 교환한다', async () => {
    const handoff = await service.createDesktopHandoff({
      sub: 'agent-1',
      tenantId: 'tenant-1',
      role: 'agent',
      extension: '1001',
      sid: 'session-hash-1',
    });

    const exchanged = await service.exchangeDesktopHandoff(handoff.data.handoffToken);

    expect(exchanged.success).toBe(true);
    expect(exchanged.data.agent.agentId).toBe('agent-1');
    await expect(service.exchangeDesktopHandoff(handoff.data.handoffToken)).rejects.toThrow(
      'Invalid or expired handoff token',
    );
  });

  it('현재 JWT 세션에 해당하는 refresh token 이 없으면 createDesktopHandoff 를 거부한다', async () => {
    prisma.refreshTokens.findUnique.mockResolvedValue(null);

    await expect(
      service.createDesktopHandoff({
        sub: 'agent-1',
        tenantId: 'tenant-1',
        role: 'agent',
        extension: '1001',
        sid: 'missing-session-hash',
      }),
    ).rejects.toThrow('Invalid or expired handoff token');
  });

  it('malformed handoff payload 는 Invalid or expired handoff token 으로 거부한다', async () => {
    const handoff = await service.createDesktopHandoff({
      sub: 'agent-1',
      tenantId: 'tenant-1',
      role: 'agent',
      extension: '1001',
      sid: 'session-hash-1',
    });
    const key = Array.from(redisStore.keys())[0];

    expect(key).toBeDefined();
    expect(key).not.toContain(handoff.data.handoffToken);

    redisStore.set(key, '{not-json');

    await expect(service.exchangeDesktopHandoff(handoff.data.handoffToken)).rejects.toThrow(
      'Invalid or expired handoff token',
    );
  });
});
