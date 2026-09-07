import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma.service';
import {
  BOOTSTRAP_TENANT_ID,
  DEFAULT_ADMIN_EXTENSION,
  TENANT_BOOTSTRAP_ADMIN_EXTENSION_ENV,
  TENANT_BOOTSTRAP_ADMIN_LOGIN_ENV,
  TENANT_BOOTSTRAP_ADMIN_PASSWORD_ENV,
  TENANT_BOOTSTRAP_CODE_ENV,
  TENANT_BOOTSTRAP_NAME_ENV,
} from './tenant-bootstrap.constants';

const BCRYPT_ROUNDS = 10;

type BootstrapResult = 'skipped' | 'existing' | 'created' | 'failed';

/**
 * 첫 테넌트와 첫 관리자(role=admin)를 env 로 한 번만 만든다.
 *
 * 테넌트를 만드는 코드가 데모 시드뿐이라 신규 사이트가 데모 계정 없이는 시작할 수 없었다
 * (갭 분석 G1·G2). `PlatformAdminBootstrapService` 와 같은 규칙을 따른다:
 *   - 테넌트가 하나라도 있으면 아무것도 건드리지 않는다. env 를 지우지 않은 사이트에서
 *     배포마다 관리자 비밀번호가 초기값으로 되돌아가면 안 된다.
 *   - 무슨 일이 있어도 부팅을 막지 않는다.
 *
 * 테넌트와 관리자는 한 트랜잭션이다. 테넌트만 생기고 관리자가 없으면 아무도 로그인할 수 없고,
 * 다음 부팅에는 "테넌트 있음" 으로 넘어가 영원히 고쳐지지 않는다.
 */
@Injectable()
export class TenantBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(TenantBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bootstrap();
  }

  async bootstrap(): Promise<BootstrapResult> {
    const tenantCode = this.env(TENANT_BOOTSTRAP_CODE_ENV);
    const tenantName = this.env(TENANT_BOOTSTRAP_NAME_ENV);
    const loginId = this.env(TENANT_BOOTSTRAP_ADMIN_LOGIN_ENV);
    const password = this.env(TENANT_BOOTSTRAP_ADMIN_PASSWORD_ENV);
    const extension = this.env(TENANT_BOOTSTRAP_ADMIN_EXTENSION_ENV) || DEFAULT_ADMIN_EXTENSION;

    // 기존 사이트에는 이 env 가 없다. 조용히 넘어간다.
    if (!tenantCode || !tenantName || !loginId || !password) {
      return 'skipped';
    }

    try {
      const existing = await this.prisma.tenants.count();
      if (existing > 0) {
        return 'existing';
      }

      const loginPasswordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await this.prisma.$transaction(async (tx) => {
        await tx.tenants.create({
          data: { tenantId: BOOTSTRAP_TENANT_ID, tenantCode, tenantName },
        });
        await tx.agents.create({
          data: {
            tenantId: BOOTSTRAP_TENANT_ID,
            loginId,
            loginPasswordHash,
            agentCode: loginId,
            agentName: loginId,
            extension,
            role: 'admin',
          },
        });
      });

      // 비밀번호는 절대 찍지 않는다.
      this.logger.warn(
        `첫 테넌트 '${tenantCode}' 와 관리자 '${loginId}' (내선 ${extension}) 를 만들었습니다 — env 의 초기 비밀번호는 로그인 직후 바꾸십시오.`,
      );
      return 'created';
    } catch (err) {
      this.logger.error(`테넌트 부트스트랩 실패: ${(err as Error).message}`);
      return 'failed';
    }
  }

  private env(key: string): string {
    return (this.config.get<string>(key, '') ?? '').trim();
  }
}
