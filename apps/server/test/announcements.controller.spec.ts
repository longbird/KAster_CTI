import { Test, TestingModule } from '@nestjs/testing';
import { AnnouncementsController } from '../src/modules/announcements/announcements.controller';
import { AnnouncementsService } from '../src/modules/announcements/announcements.service';

describe('AnnouncementsController', () => {
  let controller: AnnouncementsController;
  const service = {
    listForAgent: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnnouncementsController],
      providers: [{ provide: AnnouncementsService, useValue: service }],
    }).compile();

    controller = module.get(AnnouncementsController);
  });

  it('list 는 상담원 tenant 범위의 공지 목록을 반환한다', async () => {
    service.listForAgent.mockResolvedValue({
      success: true,
      data: [
        {
          announcementId: 'notice-1',
          title: '긴급 배차 지연',
          body: '우선 안내 후 콜백 처리',
          authorName: '관리자',
          pinned: true,
          createdAt: new Date('2026-05-05T00:00:00.000Z'),
          updatedAt: new Date('2026-05-05T00:00:00.000Z'),
        },
      ],
      error: null,
    });

    const result = await controller.list({
      tenantId: 'tenant-1',
      role: 'agent',
      sub: 'agent-1',
    });

    expect(service.listForAgent).toHaveBeenCalledWith('tenant-1');
    expect(result.data[0].title).toBe('긴급 배차 지연');
  });
});
