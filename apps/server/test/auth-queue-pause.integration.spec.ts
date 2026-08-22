import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../src/common/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { AgentStateService } from '../src/modules/calls/agent-state.service';
import { CallsService } from '../src/modules/calls/calls.service';
import { RedisService } from '../src/modules/redis/redis.service';

/**
 * 로그인·로그아웃이 상태 변경 경로를 타지 않으면, 이석해 둔 채 로그아웃한 상담원은
 * 큐에서 빠진 채로 남고 다시 로그인해도 돌아오지 않는다. 화면은 "대기" 인데 전화가
 * 영영 안 온다. 두 경로 모두 AgentStateService 를 거쳐야 큐 pause 가 같이 움직인다.
 */
describe('AuthService login/logout queue pause path', () => {
  let service: AuthService;
  let agentState: { changeStatus: jest.Mock; markLoggedOut: jest.Mock };

  const prisma = {
    agents: {
      findFirst: jest.fn(),
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
    tenantSystemSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };

  const configValues: Record<string, string> = {
    JWT_SECRET: 'change_me',
    SOFTPHONE_ENABLED: 'false',
    SOFTPHONE_ICE_SERVERS_JSON: '[]',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.agents.findFirst.mockResolvedValue({
      agentId: 'agent-1',
      tenantId: 'tenant-1',
      agentName: '상담원1',
      loginId: 'agent1001',
      extension: '1001',
      role: 'agent',
      isActive: true,
      loginPasswordHash: bcrypt.hashSync('Password123!', 4),
    });
    prisma.agents.update.mockResolvedValue({});
    prisma.refreshTokens.create.mockResolvedValue({});
    prisma.refreshTokens.updateMany.mockResolvedValue({ count: 1 });
    prisma.refreshTokens.findUnique.mockResolvedValue({
      agentId: 'agent-1',
      tenantId: 'tenant-1',
    });

    agentState = {
      changeStatus: jest.fn().mockResolvedValue({}),
      markLoggedOut: jest.fn().mockResolvedValue(undefined),
    };

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
        { provide: CallsService, useValue: {} },
        { provide: RedisService, useValue: { getClient: () => ({}) } },
        { provide: AgentStateService, useValue: agentState },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('puts the agent back to AVAILABLE through the status path on login', async () => {
    await service.login({ loginId: 'agent1001', password: 'Password123!', extension: '1001' } as any);

    expect(agentState.changeStatus).toHaveBeenCalledWith('agent-1', 'AVAILABLE');
    // 직접 쓰면 큐 pause 를 건너뛴다. 상태 기록은 changeStatus 안에서만 일어나야 한다.
    expect(prisma.agentStatusHistory.create).not.toHaveBeenCalled();
    expect(prisma.agentStatusHistory.updateMany).not.toHaveBeenCalled();
  });

  it('marks the agent logged out through the status path on logout', async () => {
    await service.logout('some-refresh-token');

    expect(agentState.markLoggedOut).toHaveBeenCalledWith('agent-1');
    expect(prisma.agentStatusHistory.updateMany).not.toHaveBeenCalled();
  });

  /**
   * 교대 근무에서 관리자가 전원 로그아웃시키는 경로다. 토큰만 revoke 하고 끝내면
   * 큐 멤버는 그대로 남아, 아무도 없는 내선으로 전화가 계속 넘어간다 —
   * logout 에서 고친 것과 같은 증상이다.
   */
  it('marks the agent logged out when every session of theirs is revoked', async () => {
    await service.logoutAll('agent-1');

    expect(prisma.refreshTokens.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ agentId: 'agent-1', revokedAt: null }),
      }),
    );
    expect(agentState.markLoggedOut).toHaveBeenCalledWith('agent-1');
  });

  it('stays idempotent when there is no refresh token to revoke', async () => {
    const response = await service.logout('');

    expect(response.success).toBe(true);
    expect(agentState.markLoggedOut).not.toHaveBeenCalled();
  });
});
