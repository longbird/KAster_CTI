import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../src/common/prisma.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { CallsService } from '../src/modules/calls/calls.service';
import { EventBusService } from '../src/modules/events/event-bus.service';
import { QueuesService } from '../src/modules/queues/queues.service';
import { RedisService } from '../src/modules/redis/redis.service';
import { JwtStrategy } from '../src/modules/auth/jwt.strategy';

describe('AuthService desktop handoff', () => {
  let service: AuthService;
  let activeSession: {
    refreshTokenId: string;
    agentId: string;
    tenantId: string;
    revokedAt: Date | null;
    expiresAt: Date;
  };
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
    eval: jest.fn(async (_script: string, _keyCount: number, key: string) => {
      const value = redisStore.get(key) ?? null;
      if (value !== null) {
        redisStore.delete(key);
      }
      return value;
    }),
  };
  const prisma = {
    agents: {
      findUnique: jest.fn(),
    },
    refreshTokens: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    redisStore.clear();
    jest.clearAllMocks();
    activeSession = {
      refreshTokenId: 'rt-1',
      agentId: 'agent-1',
      tenantId: 'tenant-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    prisma.agents.findUnique.mockResolvedValue({
      agentId: 'agent-1',
      agentName: '상담원1',
      extension: '1001',
      role: 'agent',
      tenantId: 'tenant-1',
      isActive: true,
    });
    prisma.refreshTokens.findUnique.mockImplementation(async ({ where }: { where: { tokenHash: string } }) => {
      if (where.tokenHash !== 'session-hash-1') {
        return null;
      }
      return activeSession;
    });
    prisma.refreshTokens.updateMany.mockImplementation(
      async ({ where }: { where: { agentId?: string; revokedAt?: null } }) => {
        if (where.agentId === activeSession.agentId && activeSession.revokedAt === null) {
          activeSession = {
            ...activeSession,
            revokedAt: new Date(),
          };
          return { count: 1 };
        }

        return { count: 0 };
      },
    );

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

  it('web handoff 토큰은 desktop 교환 경로에서 소비되지 않는다', async () => {
    const handoff = await service.createWebHandoff({
      sub: 'agent-1',
      tenantId: 'tenant-1',
      role: 'agent',
      extension: '1001',
      sid: 'session-hash-1',
    });

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

  it('logoutAll 이후에는 기존 sid 로 createDesktopHandoff 를 다시 만들 수 없다', async () => {
    await service.logoutAll('agent-1');

    await expect(
      service.createDesktopHandoff({
        sub: 'agent-1',
        tenantId: 'tenant-1',
        role: 'agent',
        extension: '1001',
        sid: 'session-hash-1',
      }),
    ).rejects.toThrow('Invalid or expired handoff token');
  });
});

describe('AuthController web handoff HTTP integration', () => {
  let app: INestApplication;
  const redisStore = new Map<string, string>();
  let issuedRefreshTokenHash = '';
  const agentPasswordHash = bcrypt.hashSync('Password123!', 10);
  const prisma = {
    agents: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    agentStatusHistory: {
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    refreshTokens: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };
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
    eval: jest.fn(async (_script: string, _keyCount: number, key: string) => {
      const value = redisStore.get(key) ?? null;
      if (value !== null) {
        redisStore.delete(key);
      }
      return value;
    }),
  };
  const configValues: Record<string, string> = {
    JWT_SECRET: 'change_me',
  };

  beforeEach(async () => {
    redisStore.clear();
    issuedRefreshTokenHash = '';
    jest.clearAllMocks();

    prisma.agents.findFirst.mockResolvedValue({
      agentId: 'agent-1',
      agentName: '상담원1',
      extension: '1001',
      role: 'agent',
      tenantId: 'tenant-1',
      isActive: true,
      loginPasswordHash: agentPasswordHash,
      defaultQueue: null,
    });
    prisma.agents.findUnique.mockResolvedValue({
      agentId: 'agent-1',
      agentName: '상담원1',
      extension: '1001',
      role: 'agent',
      tenantId: 'tenant-1',
      isActive: true,
      sipPassword: 'sip-secret-1001',
    });
    prisma.agents.update.mockResolvedValue({});
    prisma.agentStatusHistory.updateMany.mockResolvedValue({ count: 1 });
    prisma.agentStatusHistory.create.mockResolvedValue({});
    prisma.refreshTokens.create.mockImplementation(async ({ data }: { data: { tokenHash: string } }) => {
      issuedRefreshTokenHash = data.tokenHash;
      return {
        refreshTokenId: 'rt-1',
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        tokenHash: data.tokenHash,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      };
    });
    prisma.refreshTokens.findUnique.mockImplementation(async ({ where }: { where: { tokenHash: string } }) => {
      if (where.tokenHash !== issuedRefreshTokenHash) {
        return null;
      }

      return {
        refreshTokenId: 'rt-1',
        agentId: 'agent-1',
        tenantId: 'tenant-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      };
    });
    prisma.refreshTokens.updateMany.mockResolvedValue({ count: 1 });

    const module: TestingModule = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [AuthController],
      providers: [
        AuthService,
        JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => configValues[key] ?? defaultValue),
          },
        },
        {
          provide: CallsService,
          useValue: {
            getOutboundDialOptions: jest.fn().mockResolvedValue({
              success: true,
              data: { trunks: [] },
              error: null,
            }),
            getCallControlCapabilities: jest.fn().mockReturnValue({ hold: true, transfer: true }),
          },
        },
        { provide: EventBusService, useValue: { publish: jest.fn() } },
        { provide: QueuesService, useValue: { getSummary: jest.fn().mockResolvedValue({ data: { queues: [] } }) } },
        { provide: RedisService, useValue: { getClient: () => redisClient } },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0);
  });

  afterEach(async () => {
    await app?.close();
  });

  it('issues a web handoff token for a desktop-authenticated session and rejects replay', async () => {
    const baseUrl = await app.getUrl();

    const loginResponse = await fetch(new URL('/api/v1/auth/login', baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ loginId: 'agent1001', extension: '1001', password: 'Password123!' }),
    });

    expect(loginResponse.status).toBe(201);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.accessToken as string;

    const createResponse = await fetch(new URL('/api/v1/auth/web-handoff', baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ redirectPath: '/desktop-handoff' }),
    });

    expect(createResponse.status).toBe(201);
    const createBody = await createResponse.json();
    const handoffToken = createBody.data.handoffToken as string;

    const exchangeResponse = await fetch(new URL('/api/v1/auth/web-handoff/exchange', baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handoffToken }),
    });

    expect(exchangeResponse.status).toBe(201);
    const exchangeBody = await exchangeResponse.json();
    expect(exchangeBody.data.accessToken).toEqual(expect.any(String));
    expect(exchangeBody.data.refreshToken).toEqual(expect.any(String));

    const replayResponse = await fetch(new URL('/api/v1/auth/web-handoff/exchange', baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handoffToken }),
    });

    expect(replayResponse.status).toBe(401);
  });

  it('issues a desktop handoff token over HTTP and rejects replay', async () => {
    const baseUrl = await app.getUrl();

    const loginResponse = await fetch(new URL('/api/v1/auth/login', baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ loginId: 'agent1001', extension: '1001', password: 'Password123!' }),
    });

    expect(loginResponse.status).toBe(201);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.accessToken as string;

    const createResponse = await fetch(new URL('/api/v1/auth/handoff', baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ deviceName: 'front-desk-pc-01' }),
    });

    expect(createResponse.status).toBe(201);
    const createBody = await createResponse.json();
    const handoffToken = createBody.data.handoffToken as string;

    const exchangeResponse = await fetch(new URL('/api/v1/auth/handoff/exchange', baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handoffToken }),
    });

    expect(exchangeResponse.status).toBe(201);
    const exchangeBody = await exchangeResponse.json();
    expect(exchangeBody.data.accessToken).toEqual(expect.any(String));
    expect(exchangeBody.data.refreshToken).toEqual(expect.any(String));

    const replayResponse = await fetch(new URL('/api/v1/auth/handoff/exchange', baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handoffToken }),
    });

    expect(replayResponse.status).toBe(401);
  });

  it('does not let web and desktop handoff tokens cross-consume over HTTP', async () => {
    const baseUrl = await app.getUrl();

    const loginResponse = await fetch(new URL('/api/v1/auth/login', baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ loginId: 'agent1001', extension: '1001', password: 'Password123!' }),
    });

    expect(loginResponse.status).toBe(201);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.accessToken as string;

    const createResponse = await fetch(new URL('/api/v1/auth/web-handoff', baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ redirectPath: '/desktop-handoff' }),
    });

    expect(createResponse.status).toBe(201);
    const createBody = await createResponse.json();
    const handoffToken = createBody.data.handoffToken as string;

    const desktopExchangeResponse = await fetch(new URL('/api/v1/auth/handoff/exchange', baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handoffToken }),
    });

    expect(desktopExchangeResponse.status).toBe(401);
  });
});
