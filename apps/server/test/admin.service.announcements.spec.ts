import { AdminService } from '../src/modules/admin/admin.service';
import { REALTIME_EVENTS } from '../src/modules/realtime/realtime-events';

function createService() {
  const prisma = {
    announcements: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  } as any;

  const eventBus = { publish: jest.fn().mockResolvedValue(undefined) } as any;

  return {
    prisma,
    eventBus,
    service: new AdminService(
      prisma,
      {} as any,
      { executeReload: jest.fn() } as any,
      {} as any,
      {} as any,
      eventBus,
    ),
  };
}

describe('AdminService announcement realtime push', () => {
  it('createAnnouncement 은 announcement.pushed 를 tenant 범위로 publish 한다', async () => {
    const { prisma, eventBus, service } = createService();
    prisma.announcements.create.mockResolvedValue({
      announcementId: 'a-1',
      tenantId: 'tenant-1',
      title: '점검 공지',
      body: '23시',
      authorName: '관리자',
      pinned: true,
      createdAt: new Date('2026-05-08T00:00:00.000Z'),
    });

    await service.createAnnouncement(
      'tenant-1',
      { title: '점검 공지', body: '23시', pinned: true } as any,
      { agentName: '관리자' },
    );

    expect(eventBus.publish).toHaveBeenCalledWith(
      REALTIME_EVENTS.ANNOUNCEMENT_PUSHED,
      expect.objectContaining({
        action: 'created',
        announcementId: 'a-1',
        title: '점검 공지',
        pinned: true,
      }),
      'tenant-1',
    );
  });

  it('updateAnnouncement 은 변경된 행이 있을 때만 publish 한다', async () => {
    const { prisma, eventBus, service } = createService();
    prisma.announcements.updateMany.mockResolvedValueOnce({ count: 0 });

    await service.updateAnnouncement(
      'tenant-1',
      'a-1',
      { title: '없는 공지', body: 'x' } as any,
    );

    expect(eventBus.publish).not.toHaveBeenCalled();

    prisma.announcements.updateMany.mockResolvedValueOnce({ count: 1 });
    await service.updateAnnouncement(
      'tenant-1',
      'a-1',
      { title: '수정 공지', body: 'y', pinned: false } as any,
    );

    expect(eventBus.publish).toHaveBeenCalledWith(
      REALTIME_EVENTS.ANNOUNCEMENT_PUSHED,
      expect.objectContaining({
        action: 'updated',
        announcementId: 'a-1',
        title: '수정 공지',
        pinned: false,
      }),
      'tenant-1',
    );
  });
});
