import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/common/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { CallsService } from '../src/modules/calls/calls.service';
import { EventBusService } from '../src/modules/events/event-bus.service';
import { QueuesService } from '../src/modules/queues/queues.service';
import { RedisService } from '../src/modules/redis/redis.service';

describe('AuthService softphone config', () => {
  let service: AuthService;
  let agentRecord: Record<string, unknown>;
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
  const configValues: Record<string, string> = {
    JWT_SECRET: 'change_me',
    SOFTPHONE_ENABLED: 'true',
    SOFTPHONE_SIP_DOMAIN: 'pbx.example.com',
    SOFTPHONE_WS_SERVER: 'wss://pbx.example.com:8089/ws',
    SOFTPHONE_ICE_SERVERS_JSON:
      '[{"urls":["stun:stun.example.com:3478"]},{"urls":["turn:turn.example.com:3478"],"username":"turn-user","credential":"turn-pass"}]',
  };

  beforeEach(async () => {
    redisStore.clear();
    jest.clearAllMocks();
    agentRecord = {
      agentId: 'agent-1',
      tenantId: 'tenant-1',
      loginId: 'agent1001',
      loginPasswordHash: 'hashed-login-password',
      agentName: '상담원1',
      extension: '1001',
      sipPassword: 'sip-secret-1001',
      role: 'agent',
      isActive: true,
      defaultQueue: null,
    };
    prisma.agents.findUnique.mockImplementation(async ({ select }: { select?: Record<string, boolean> }) => {
      if (!select) {
        return agentRecord;
      }

      return Object.fromEntries(
        Object.entries(select).map(([key]) => [key, agentRecord[key]]),
      );
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

    service = module.get(AuthService);
  });

  it('getSession 은 env 기반 softphoneConfig 를 포함한다', async () => {
    const session = await service.getSession({
      sub: 'agent-1',
      tenantId: 'tenant-1',
      role: 'agent',
      extension: '1001',
    });

    expect(session.data.softphoneConfig).toEqual({
      enabled: true,
      sipUri: 'sip:1001@pbx.example.com',
      wsServer: 'wss://pbx.example.com:8089/ws',
      authorizationUsername: '1001',
      displayName: '상담원1',
      iceServers: [
        { urls: ['stun:stun.example.com:3478'] },
        {
          urls: ['turn:turn.example.com:3478'],
          username: 'turn-user',
          credential: 'turn-pass',
        },
      ],
    });
    expect(session.data.agent).toEqual({
      agentId: 'agent-1',
      agentName: '상담원1',
      extension: '1001',
      role: 'agent',
      tenantId: 'tenant-1',
      defaultQueue: null,
    });
    expect(session.data.agent).not.toHaveProperty('loginPasswordHash');
    expect(session.data.agent).not.toHaveProperty('sipPassword');
    expect(session.data).not.toHaveProperty('jwt');
  });

  it('exchangeDesktopHandoff 는 softphone credential 없이 토큰과 agent 를 반환한다', async () => {
    const handoff = await service.createDesktopHandoff({
      sub: 'agent-1',
      tenantId: 'tenant-1',
      role: 'agent',
      extension: '1001',
      sid: 'session-hash-1',
    });

    const exchanged = await service.exchangeDesktopHandoff(handoff.data.handoffToken);

    expect(exchanged.data.agent.agentId).toBe('agent-1');
    expect(exchanged.data.accessToken).toBeTruthy();
    expect('softphoneConfig' in exchanged.data).toBe(false);
  });
});
