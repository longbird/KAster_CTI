import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma.service';
import { BOOTSTRAP_LOGIN_ENV, BOOTSTRAP_PASSWORD_ENV } from './platform-admin.constants';

const BCRYPT_ROUNDS = 10;

type BootstrapResult = 'skipped' | 'existing' | 'created' | 'failed';

/**
 * 첫 플랫폼 관리자 계정을 env 로 한 번만 만든다 (설계 §8.1).
 *
 * 두 가지를 절대 하지 않는다:
 *   - 계정이 이미 있으면 아무것도 건드리지 않는다. env 를 지우지 않은 사이트에서
 *     운영 중인 계정의 비밀번호가 배포마다 초기값으로 되돌아가면 안 된다.
 *   - 무슨 일이 있어도 부팅을 막지 않는다. 마이그레이션 전이거나 DB 가 흔들려도
 *     이것 때문에 서버 전체가 못 뜨는 쪽이 훨씬 나쁘다.
 */
@Injectable()
export class PlatformAdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(PlatformAdminBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bootstrap();
  }

  async bootstrap(): Promise<BootstrapResult> {
    const loginId = (this.config.get<string>(BOOTSTRAP_LOGIN_ENV, '') ?? '').trim();
    const password = (this.config.get<string>(BOOTSTRAP_PASSWORD_ENV, '') ?? '').trim();

    // 기존 사이트에는 이 env 가 없다. 조용히 넘어간다.
    if (!loginId || !password) {
      return 'skipped';
    }

    try {
      const existing = await (this.prisma as any).platformAdmins.count();
      if (existing > 0) {
        return 'existing';
      }

      await (this.prisma as any).platformAdmins.create({
        data: {
          loginId,
          displayName: loginId,
          passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
          // env 파일에 남은 값은 1회용 초기 비밀번호이지 운영 비밀번호가 아니다.
          mustChangePassword: true,
        },
      });

      // 비밀번호는 절대 찍지 않는다.
      this.logger.warn(
        `플랫폼 관리자 부트스트랩 계정을 생성했습니다: ${loginId} — 첫 로그인에서 비밀번호를 바꿔야 합니다.`,
      );
      return 'created';
    } catch (err) {
      this.logger.error(`플랫폼 관리자 부트스트랩 실패: ${(err as Error).message}`);
      return 'failed';
    }
  }
}
