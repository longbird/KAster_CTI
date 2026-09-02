import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../common/prisma.service';
import { ALLOW_MUST_CHANGE_PASSWORD_KEY } from './allow-must-change-password.decorator';
import { PLATFORM_TOKEN_SCOPE } from './platform-admin.constants';

export interface PlatformAdminPrincipal {
  platformAdminId: string;
  loginId: string;
  displayName: string;
  mustChangePassword: boolean;
}

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractBearer(request?.headers?.authorization);
    if (!token) {
      throw new UnauthorizedException('플랫폼 관리자 토큰이 필요합니다.');
    }

    const payload = this.verify(token);

    // 상담원 토큰과 같은 비밀로 서명되므로 서명 검증만으로는 구분되지 않는다.
    // 이 한 줄이 없으면 상담원 access token 으로 전 테넌트의 자격을 바꿀 수 있다.
    if (payload?.scope !== PLATFORM_TOKEN_SCOPE) {
      throw new UnauthorizedException('플랫폼 관리자 토큰이 아닙니다.');
    }

    const admin = await (this.prisma as any).platformAdmins.findUnique({
      where: { platformAdminId: payload.sub },
      select: {
        platformAdminId: true,
        loginId: true,
        displayName: true,
        isActive: true,
        mustChangePassword: true,
      },
    });

    // 비활성 판정을 토큰이 아니라 DB 로 하는 이유: 계정을 비활성화한 직후부터 막혀야 한다.
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('사용할 수 없는 플랫폼 관리자 계정입니다.');
    }

    const allowMustChangePassword = this.reflector.getAllAndOverride<boolean | undefined>(
      ALLOW_MUST_CHANGE_PASSWORD_KEY,
      [context.getHandler(), context.getClass()],
    );

    // env 에 적힌 초기 비밀번호가 운영 비밀번호로 굳는 것을 막는 유일한 장치다.
    if (admin.mustChangePassword && !allowMustChangePassword) {
      throw new ForbiddenException('비밀번호를 먼저 변경해야 합니다.');
    }

    request.platformAdmin = {
      platformAdminId: admin.platformAdminId,
      loginId: admin.loginId,
      displayName: admin.displayName,
      mustChangePassword: admin.mustChangePassword,
    } satisfies PlatformAdminPrincipal;
    return true;
  }

  private verify(token: string): jwt.JwtPayload {
    try {
      return jwt.verify(
        token,
        this.config.get<string>('JWT_SECRET', 'change_me'),
      ) as jwt.JwtPayload;
    } catch {
      throw new UnauthorizedException('플랫폼 관리자 토큰이 유효하지 않습니다.');
    }
  }

  private extractBearer(authorization?: string): string | null {
    if (typeof authorization !== 'string') return null;
    const [scheme, value] = authorization.split(' ');
    if (!value || scheme.toLowerCase() !== 'bearer') return null;
    return value.trim() || null;
  }
}
