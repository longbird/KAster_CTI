import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_FEATURE_KEY } from '../decorators/requires-feature.decorator';
import { FeatureKey } from '../feature-catalog';
import { FeatureEntitlementService } from '../feature-entitlement.service';

/**
 * `@RequiresFeature(...)` 가 붙은 곳에서 테넌트 자격을 확인한다.
 *
 * **전역 가드로 등록하지 않는다.** 전역 가드는 컨트롤러 가드보다 먼저 돌아
 * `JwtAuthGuard` 가 `request.user` 를 채우기 전에 실행된다. 그러면 테넌트를 알 수 없다.
 * 컨트롤러에서 `@UseGuards(JwtAuthGuard, RolesGuard, FeatureEntitlementGuard)` 로 순서를 지정한다.
 */
@Injectable()
export class FeatureEntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlement: FeatureEntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureKey = this.reflector.getAllAndOverride<FeatureKey | undefined>(
      REQUIRES_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!featureKey) return true;

    const request = context.switchToHttp().getRequest();
    const tenantId = request?.user?.tenantId;
    // 테넌트를 모르면 열어주지 않는다. 열어주면 가드 순서가 틀렸을 때 검사가 조용히 사라진다.
    if (!tenantId) {
      throw new ForbiddenException('기능 자격을 확인할 수 없습니다.');
    }

    await this.entitlement.assertEnabled(tenantId, featureKey);
    return true;
  }
}
