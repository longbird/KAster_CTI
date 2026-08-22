import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/common/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { CallsService } from '../src/modules/calls/calls.service';
import { EventBusService } from '../src/modules/events/event-bus.service';
import { QueuesService } from '../src/modules/queues/queues.service';
import { AgentStateService } from '../src/modules/calls/agent-state.service';
import { RedisService } from '../src/modules/redis/redis.service';

describe('AuthService desktop session', () => {
  let service: AuthService;
  const prisma = {
    agents: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    tenantSystemSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  const configValues: Record<string, string> = {
    JWT_SECRET: 'change_me',
    SOFTPHONE_ENABLED: 'true',
    SOFTPHONE_SIP_DOMAIN: 'pbx.example.com',
    SOFTPHONE_WS_SERVER: 'wss://pbx.example.com:8089/ws',
    SOFTPHONE_ICE_SERVERS_JSON: '[]',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.agents.findUnique.mockResolvedValue({
      agentId: 'agent-1',
      agentName: '상담원1',
      extension: '1001',
      role: 'agent',
      tenantId: 'tenant-1',
      isActive: true,
      sipPassword: 'sip-secret-1001',
    });
    prisma.agents.findFirst.mockResolvedValue({
      agentId: 'agent-1',
      agentName: '상담원1',
      extension: '1001',
      role: 'agent',
      tenantId: 'tenant-1',
      isActive: true,
      sipPassword: 'sip-secret-1001',
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
            getOutboundCallCapabilities: jest.fn().mockResolvedValue({
              canOriginateExternal: true,
              canOriginateInternal: true,
              canUsePhoneDirect: false,
              outboundDialPermissions: {},
              outboundDialOptions: { allowedCallerIds: [], defaultCallerId: null },
              disabledReasons: [],
            }),
            getCallControlCapabilities: jest.fn().mockReturnValue({ hold: true, transfer: true }),
          },
        },
        { provide: EventBusService, useValue: { publish: jest.fn() } },
        { provide: QueuesService, useValue: { getSummary: jest.fn().mockResolvedValue({ data: { queues: [] } }) } },
        { provide: RedisService, useValue: { getClient: () => ({}) } },
        {
          provide: AgentStateService,
          useValue: { changeStatus: jest.fn(), markLoggedOut: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('getDesktopSession 은 desktop 전용 softphone credential 을 포함한다', async () => {
    const response = await service.getDesktopSession({
      sub: 'agent-1',
      tenantId: 'tenant-1',
      extension: '1001',
    });

    expect(response.data).toEqual({
      agent: {
        agentId: 'agent-1',
        agentName: '상담원1',
        extension: '1001',
        role: 'agent',
      },
      softphoneConfig: {
        enabled: true,
        sipUri: 'sip:1001@pbx.example.com',
        wsServer: 'wss://pbx.example.com:8089/ws',
        sipServer: null,
        transport: 'udp',
        authorizationUsername: '1001',
        authorizationPassword: 'sip-secret-1001',
        displayName: '상담원1',
        iceServers: [],
      },
      callCapabilities: {
        canOriginateExternal: true,
        canOriginateInternal: true,
        canUsePhoneDirect: false,
        outboundDialPermissions: {},
        outboundDialOptions: { allowedCallerIds: [], defaultCallerId: null },
        disabledReasons: [],
      },
    });
  });
});
