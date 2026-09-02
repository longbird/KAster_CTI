import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PlatformAdminsService } from './platform-admins.service';

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';

const ROW = {
  platformAdminId: OTHER_ID,
  loginId: 'second',
  displayName: '두 번째 관리자',
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date('2026-09-02T00:00:00Z'),
};

function buildService(overrides: Record<string, unknown> = {}) {
  const prisma: any = {
    platformAdmins: {
      findMany: jest.fn().mockResolvedValue([ROW]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(ROW),
      update: jest.fn().mockResolvedValue(ROW),
      ...overrides,
    },
  };
  return { service: new PlatformAdminsService(prisma), prisma };
}

describe('PlatformAdminsService', () => {
  it('목록은 계약된 필드만 준다 — 비밀번호 해시는 나가지 않는다', async () => {
    const { service, prisma } = buildService();

    await expect(service.list()).resolves.toEqual([ROW]);

    const [{ select }] = prisma.platformAdmins.findMany.mock.calls[0];
    expect(Object.keys(select).sort()).toEqual(
      ['createdAt', 'displayName', 'isActive', 'lastLoginAt', 'loginId', 'platformAdminId'],
    );
    expect(select.passwordHash).toBeUndefined();
  });

  it('생성 시 비밀번호를 bcrypt 해시로 저장한다', async () => {
    const { service, prisma } = buildService();

    await service.create({ loginId: 'second', displayName: '두 번째 관리자', password: 'Password123!' });

    const [{ data }] = prisma.platformAdmins.create.mock.calls[0];
    expect(data.passwordHash).not.toBe('Password123!');
    await expect(bcrypt.compare('Password123!', data.passwordHash)).resolves.toBe(true);
  });

  // 만든 사람이 아는 비밀번호는 운영 비밀번호가 아니다. 부트스트랩 계정과 같은 이유다.
  it('만들어진 계정은 첫 로그인에서 비밀번호를 바꿔야 한다', async () => {
    const { service, prisma } = buildService();

    await service.create({ loginId: 'second', displayName: '두 번째 관리자', password: 'Password123!' });

    const [{ data }] = prisma.platformAdmins.create.mock.calls[0];
    expect(data.mustChangePassword).toBe(true);
  });

  it('중복 loginId 는 409 다', async () => {
    const { service } = buildService({ findUnique: jest.fn().mockResolvedValue(ROW) });

    await expect(
      service.create({ loginId: 'second', displayName: '중복', password: 'Password123!' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('없는 계정을 비활성화하면 404 다', async () => {
    const { service } = buildService({ findUnique: jest.fn().mockResolvedValue(null) });

    await expect(service.setActive(OTHER_ID, false, ADMIN_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('활성/비활성을 바꾼다', async () => {
    const { service, prisma } = buildService({ findUnique: jest.fn().mockResolvedValue(ROW) });

    await service.setActive(OTHER_ID, false, ADMIN_ID);

    expect(prisma.platformAdmins.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platformAdminId: OTHER_ID },
        data: { isActive: false },
      }),
    );
  });

  // 마지막 관리자가 자기를 끄면 아무도 로그인할 수 없고, 부트스트랩은 계정이 있으니 돌지 않는다.
  it('자기 계정은 비활성화할 수 없다', async () => {
    const { service, prisma } = buildService({ findUnique: jest.fn().mockResolvedValue(ROW) });

    await expect(service.setActive(ADMIN_ID, false, ADMIN_ID)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.platformAdmins.update).not.toHaveBeenCalled();
  });

  it('자기 계정을 다시 켜는 것은 막지 않는다', async () => {
    const { service, prisma } = buildService({ findUnique: jest.fn().mockResolvedValue(ROW) });

    await service.setActive(ADMIN_ID, true, ADMIN_ID);

    expect(prisma.platformAdmins.update).toHaveBeenCalled();
  });
});
