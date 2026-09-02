import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../common/prisma.service';
import { ChangePlatformPasswordDto } from './dto/change-platform-password.dto';
import { PlatformLoginDto } from './dto/platform-login.dto';
import {
  PLATFORM_ACCESS_TOKEN_TTL,
  PLATFORM_REFRESH_TOKEN_TTL_DAYS,
  PLATFORM_TOKEN_SCOPE,
} from './platform-admin.constants';

const BCRYPT_ROUNDS = 10;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

interface PlatformAdminRow {
  platformAdminId: string;
  loginId: string;
  displayName: string;
  passwordHash: string;
  isActive: boolean;
  mustChangePassword: boolean;
}

/**
 * 플랫폼 관리자 인증. 상담원 인증(`AuthService`)과 **테이블도 토큰도 다르다**.
 *
 * refresh 토큰 취급은 상담원 쪽과 같은 규칙을 따른다 — 원본은 클라이언트만 갖고
 * 서버는 SHA-256 해시만 저장하며, refresh 마다 기존 토큰을 revoke 하고 새로 발급한다(회전).
 * 두 경로가 다른 규칙을 쓰면 어느 쪽이 약한지 나중에 아무도 모른다.
 */
@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: PlatformLoginDto, meta?: { userAgent?: string; ipAddress?: string }) {
    const admin: PlatformAdminRow | null = await (this.prisma as any).platformAdmins.findUnique({
      where: { loginId: dto.loginId },
    });

    // 계정 없음과 비밀번호 틀림을 같은 문구로 답한다. 구분해 주면 계정 존재 여부가 새어 나간다.
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!(await bcrypt.compare(dto.password, admin.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await (this.prisma as any).platformAdmins.update({
      where: { platformAdminId: admin.platformAdminId },
      data: { lastLoginAt: new Date() },
    });

    const refreshToken = await this.issueRefreshToken(admin.platformAdminId, meta);
    return {
      accessToken: this.signAccessToken(admin.platformAdminId),
      refreshToken,
      admin: this.toProfile(admin),
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const row = await (this.prisma as any).platformAdminRefreshTokens.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { platformAdmin: true },
    });

    if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (!row.platformAdmin?.isActive) {
      throw new UnauthorizedException('Platform admin inactive');
    }

    // 회전: 쓴 토큰은 즉시 죽인다. 재사용 공격 방지.
    await (this.prisma as any).platformAdminRefreshTokens.update({
      where: { refreshTokenId: row.refreshTokenId },
      data: { revokedAt: new Date() },
    });

    const newRefreshToken = await this.issueRefreshToken(row.platformAdmin.platformAdminId, {
      userAgent: row.userAgent ?? undefined,
      ipAddress: row.ipAddress ?? undefined,
    });

    return {
      accessToken: this.signAccessToken(row.platformAdmin.platformAdminId),
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken?: string) {
    // 멱등: 토큰이 없어도 성공 취급. 로그아웃이 실패하면 화면이 로그인 상태로 남는다.
    if (!refreshToken) {
      return { success: true };
    }
    await (this.prisma as any).platformAdminRefreshTokens.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async changePassword(platformAdminId: string, dto: ChangePlatformPasswordDto) {
    const admin: PlatformAdminRow | null = await (this.prisma as any).platformAdmins.findUnique({
      where: { platformAdminId },
    });
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('사용할 수 없는 플랫폼 관리자 계정입니다.');
    }
    if (!(await bcrypt.compare(dto.currentPassword, admin.passwordHash))) {
      throw new UnauthorizedException('현재 비밀번호가 맞지 않습니다.');
    }
    // 같은 값으로 "변경" 하면 env 에 적힌 초기 비밀번호가 그대로 운영 비밀번호가 된다.
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('새 비밀번호가 이전 비밀번호와 같습니다.');
    }

    await (this.prisma as any).platformAdmins.update({
      where: { platformAdminId },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS),
        mustChangePassword: false,
      },
    });

    return { changed: true };
  }

  private toProfile(admin: PlatformAdminRow) {
    return {
      platformAdminId: admin.platformAdminId,
      loginId: admin.loginId,
      displayName: admin.displayName,
      mustChangePassword: admin.mustChangePassword,
    };
  }

  private signAccessToken(platformAdminId: string): string {
    // tenantId 를 넣지 않는다. 이 계정은 어느 테넌트에도 속하지 않는다.
    return jwt.sign(
      { sub: platformAdminId, scope: PLATFORM_TOKEN_SCOPE },
      this.config.get<string>('JWT_SECRET', 'change_me'),
      { expiresIn: PLATFORM_ACCESS_TOKEN_TTL },
    );
  }

  private async issueRefreshToken(
    platformAdminId: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<string> {
    // JWT 가 아니라 256bit 랜덤 문자열이다. 유효성은 오직 DB 해시 매칭으로만 판단한다.
    const value = randomBytes(32).toString('hex');
    await (this.prisma as any).platformAdminRefreshTokens.create({
      data: {
        platformAdminId,
        tokenHash: sha256(value),
        expiresAt: new Date(Date.now() + PLATFORM_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
        userAgent: meta?.userAgent ?? null,
        ipAddress: meta?.ipAddress ?? null,
      },
    });
    return value;
  }
}
