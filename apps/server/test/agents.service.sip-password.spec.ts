import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/common/prisma.service';
import { AgentsService } from '../src/modules/agents/agents.service';
import { AmiConnectionService } from '../src/modules/ami/ami-connection.service';
import { AsteriskReloadService } from '../src/modules/asterisk-config/asterisk-reload.service';
import { AgentStateService } from '../src/modules/calls/agent-state.service';

/**
 * 상담원 편집 화면은 폼 전체를 PATCH 로 보낸다. 그 폼에 SIP 비밀번호 입력칸이 없어도
 * 폼 스토어에 남은 빈 문자열이 함께 실려 오는데, 예전 규칙(`trim() || null`)이 그것을
 * 삭제 지시로 읽어 이름만 바꿔 저장해도 SIP 비밀번호가 조용히 지워졌다.
 * 그 결과가 내선 3304 의 등록 실패였다 (2026-08-24).
 */
describe('AgentsService update — SIP 비밀번호', () => {
  const TENANT = '00000000-0000-0000-0000-000000000001';
  const AGENT = 'agent-3304';

  let service: AgentsService;
  let reload: { scheduleReload: jest.Mock };

  const prisma = {
    agents: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.agents.findFirst.mockResolvedValue({
      agentId: AGENT,
      tenantId: TENANT,
      loginId: '3304',
      extension: '3304',
      sipPassword: '69200000',
    });
    prisma.agents.update.mockResolvedValue({ agentId: AGENT });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AsteriskReloadService, useValue: { scheduleReload: jest.fn() } },
        {
          provide: AmiConnectionService,
          useValue: {
            sendActionCollect: jest.fn().mockResolvedValue([]),
            sendAction: jest.fn().mockResolvedValue(undefined),
            sendActionWithResponse: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: AgentStateService, useValue: { changeStatus: jest.fn() } },
      ],
    }).compile();

    service = module.get(AgentsService);
    reload = module.get(AsteriskReloadService);
  });

  const dataOfLastUpdate = () => prisma.agents.update.mock.calls[0][0].data;

  it('빈 문자열은 변경 없음이다 — 이름만 고쳐도 SIP 비밀번호가 지워지면 안 된다', async () => {
    await service.update(TENANT, AGENT, { agentName: '강병환4', sipPassword: '' } as any);

    expect(dataOfLastUpdate()).not.toHaveProperty('sipPassword');
  });

  it('공백뿐인 값도 변경 없음이다', async () => {
    await service.update(TENANT, AGENT, { sipPassword: '   ' } as any);

    expect(dataOfLastUpdate()).not.toHaveProperty('sipPassword');
  });

  it('보내지 않으면 변경 없음이다', async () => {
    await service.update(TENANT, AGENT, { agentName: '강병환4' } as any);

    expect(dataOfLastUpdate()).not.toHaveProperty('sipPassword');
  });

  it('null 은 명시적 삭제다 — 사이트 기본값으로 되돌린다', async () => {
    await service.update(TENANT, AGENT, { sipPassword: null } as any);

    expect(dataOfLastUpdate()).toMatchObject({ sipPassword: null });
  });

  it('값을 주면 앞뒤 공백을 떼고 저장한다', async () => {
    await service.update(TENANT, AGENT, { sipPassword: ' 69200000 ' } as any);

    expect(dataOfLastUpdate()).toMatchObject({ sipPassword: '69200000' });
  });

  it('빈 문자열만 온 저장은 PBX 리로드를 부르지 않는다', async () => {
    await service.update(TENANT, AGENT, { sipPassword: '' } as any);

    expect(reload.scheduleReload).not.toHaveBeenCalled();
  });

  it('실제로 바뀐 비밀번호는 PBX 리로드를 부른다', async () => {
    await service.update(TENANT, AGENT, { sipPassword: '69200000' } as any);

    expect(reload.scheduleReload).toHaveBeenCalledWith(TENANT);
  });
});
