import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PlatformAdminBootstrapService } from './platform-admin-bootstrap.service';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformAdminsController } from './platform-admins.controller';
import { PlatformAdminsService } from './platform-admins.service';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformEntitlementsController } from './platform-entitlements.controller';
import { PlatformTenantsController } from './platform-tenants.controller';

/**
 * 플랫폼 관리자 — 테넌트 밖의 계정이다.
 *
 * `FeatureEntitlementService` 는 @Global 인 `FeatureEntitlementModule` 이 준다.
 * 자격 판정 인스턴스가 갈라지면 캐시도 갈라지므로 여기서 다시 provide 하지 않는다.
 */
@Module({
  controllers: [
    PlatformAuthController,
    PlatformTenantsController,
    PlatformEntitlementsController,
    PlatformAdminsController,
  ],
  providers: [
    PrismaService,
    PlatformAdminGuard,
    PlatformAuthService,
    PlatformAdminsService,
    PlatformAdminBootstrapService,
  ],
})
export class PlatformAdminModule {}
