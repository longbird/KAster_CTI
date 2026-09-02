import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { PlatformAuthService } from './platform-auth.service';

const SECRET = 'platform-auth-test-secret';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const PASSWORD = 'Password123!';

let passwordHash: string;

function buildAdmin(overrides: Record<string, unknown> = {}) {
  return {
    platformAdminId: ADMIN_ID,
    loginId: 'root',
    displayName: '플랫폼 관리자',
    passwordHash,
    isActive: true,
    mustChangePassword: false,
    ...overrides,
  };
}

function buildService(admin: unknown = buildAdmin()) {
  const prisma: any = {
    platformAdmins: {
      findUnique: jest.fn().mockResolvedValue(admin),
      update: jest.fn().mockResolvedValue(admin),
    },
    platformAdminRefreshTokens: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const config: any = { get: (key: string, fallback?: string) => (key === 'JWT_SECRET' ? SECRET : fallback) };
  return { service: new PlatformAuthService(prisma, config), prisma };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('PlatformAuthService', () => {
  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 10);
  });

  describe('login', () => {
    it('access token 에 platform scope 를 넣고 tenantId 는 넣지 않는다', async () => {
      const { service } = buildService();

      const result = await service.login({ loginId: 'root', password: PASSWORD });
      const payload = jwt.verify(result.accessToken, SECRET) as jwt.JwtPayload;

      expect(payload.scope).toBe('platform');
      expect(payload.sub).toBe(ADMIN_ID);
      expect(payload.tenantId).toBeUndefined();
    });

    it('refresh token 원본은 저장하지 않고 SHA-256 해시만 저장한다', async () => {
      const { service, prisma } = buildService();

      const result = await service.login({ loginId: 'root', password: PASSWORD });

      const [{ data }] = prisma.platformAdminRefreshTokens.create.mock.calls[0];
      expect(data.tokenHash).toBe(sha256(result.refreshToken));
      expect(data.tokenHash).not.toBe(result.refreshToken);
      expect(data.platformAdminId).toBe(ADMIN_ID);
    });

    it('계약된 admin 프로필을 함께 준다', async () => {
      const { service } = buildService(buildAdmin({ mustChangePassword: true }));

      const result = await service.login({ loginId: 'root', password: PASSWORD });

      expect(result.admin).toEqual({
        platformAdminId: ADMIN_ID,
        loginId: 'root',
        displayName: '플랫폼 관리자',
        mustChangePassword: true,
      });
    });

    it('마지막 로그인 시각을 남긴다', async () => {
      const { service, prisma } = buildService();

      await service.login({ loginId: 'root', password: PASSWORD });

      const [{ data }] = prisma.platformAdmins.update.mock.calls[0];
      expect(data.lastLoginAt).toBeInstanceOf(Date);
    });

    it('비밀번호가 틀리면 거부한다', async () => {
      const { service } = buildService();

      await expect(service.login({ loginId: 'root', password: 'wrong-password' }))
        .rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('없는 계정과 비활성 계정을 거부한다', async () => {
      await expect(buildService(null).service.login({ loginId: 'nope', password: PASSWORD }))
        .rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        buildService(buildAdmin({ isActive: false })).service.login({ loginId: 'root', password: PASSWORD }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    // mustChangePassword 계정도 로그인 자체는 된다 — 안 되면 비밀번호를 바꿀 방법이 없다.
    it('비밀번호를 바꿔야 하는 계정도 로그인은 된다', async () => {
      const { service } = buildService(buildAdmin({ mustChangePassword: true }));

      await expect(service.login({ loginId: 'root', password: PASSWORD })).resolves.toBeDefined();
    });
  });

  describe('refresh', () => {
    function buildRefreshService(row: unknown) {
      const { service, prisma } = buildService();
      prisma.platformAdminRefreshTokens.findUnique.mockResolvedValue(row);
      return { service, prisma };
    }

    const validRow = () => ({
      refreshTokenId: 'token-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      userAgent: 'jest',
      ipAddress: '127.0.0.1',
      platformAdmin: buildAdmin(),
    });

    it('기존 토큰을 revoke 하고 새 쌍을 발급한다 (회전)', async () => {
      const { service, prisma } = buildRefreshService(validRow());

      const result = await service.refresh('old-token');

      expect(prisma.platformAdminRefreshTokens.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { refreshTokenId: 'token-1' } }),
      );
      const [{ data }] = prisma.platformAdminRefreshTokens.update.mock.calls[0];
      expect(data.revokedAt).toBeInstanceOf(Date);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).not.toBe('old-token');
    });

    it('없는·revoke 된·만료된 토큰을 거부한다', async () => {
      await expect(buildRefreshService(null).service.refresh('x'))
        .rejects.toBeInstanceOf(UnauthorizedException);
      await expect(buildRefreshService({ ...validRow(), revokedAt: new Date() }).service.refresh('x'))
        .rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        buildRefreshService({ ...validRow(), expiresAt: new Date(Date.now() - 1000) }).service.refresh('x'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('빈 토큰을 거부한다', async () => {
      const { service } = buildRefreshService(validRow());

      await expect(service.refresh('')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('비활성화된 계정의 토큰을 거부한다', async () => {
      const { service } = buildRefreshService({
        ...validRow(),
        platformAdmin: buildAdmin({ isActive: false }),
      });

      await expect(service.refresh('old-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('토큰이 없어도 성공한다 (멱등)', async () => {
      const { service, prisma } = buildService();

      await expect(service.logout(undefined)).resolves.toEqual({ success: true });
      expect(prisma.platformAdminRefreshTokens.updateMany).not.toHaveBeenCalled();
    });

    it('해시로 찾아 revoke 한다', async () => {
      const { service, prisma } = buildService();

      await service.logout('some-token');

      const [{ where, data }] = prisma.platformAdminRefreshTokens.updateMany.mock.calls[0];
      expect(where).toEqual({ tokenHash: sha256('some-token'), revokedAt: null });
      expect(data.revokedAt).toBeInstanceOf(Date);
    });
  });

  describe('changePassword', () => {
    it('새 해시를 저장하고 변경 강제를 푼다', async () => {
      const { service, prisma } = buildService(buildAdmin({ mustChangePassword: true }));

      await expect(
        service.changePassword(ADMIN_ID, { currentPassword: PASSWORD, newPassword: 'NewPassword123!' }),
      ).resolves.toEqual({ changed: true });

      const [{ data }] = prisma.platformAdmins.update.mock.calls[0];
      expect(data.mustChangePassword).toBe(false);
      await expect(bcrypt.compare('NewPassword123!', data.passwordHash)).resolves.toBe(true);
    });

    it('현재 비밀번호가 틀리면 거부한다', async () => {
      const { service, prisma } = buildService();

      await expect(
        service.changePassword(ADMIN_ID, { currentPassword: 'wrong', newPassword: 'NewPassword123!' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.platformAdmins.update).not.toHaveBeenCalled();
    });

    // 변경 강제를 "바꿨다" 로 통과시키고 같은 값을 넣으면 env 비밀번호가 그대로 운영 비밀번호가 된다.
    it('이전과 같은 비밀번호를 거부한다', async () => {
      const { service } = buildService(buildAdmin({ mustChangePassword: true }));

      await expect(
        service.changePassword(ADMIN_ID, { currentPassword: PASSWORD, newPassword: PASSWORD }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('없거나 비활성인 계정을 거부한다', async () => {
      await expect(
        buildService(null).service.changePassword(ADMIN_ID, {
          currentPassword: PASSWORD,
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
