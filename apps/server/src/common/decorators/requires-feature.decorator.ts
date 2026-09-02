import { SetMetadata } from '@nestjs/common';
import { FeatureKey } from '../feature-catalog';

export const REQUIRES_FEATURE_KEY = 'requiresFeature';

/**
 * 이 테넌트에 해당 기능 자격이 있어야 통과한다. `FeatureEntitlementGuard` 가 읽는다.
 * 예: @RequiresFeature('call-analysis')
 *
 * **`JwtAuthGuard` 뒤에 놓아야 한다** — 테넌트를 `request.user` 에서 읽기 때문이다.
 * `@UseGuards(JwtAuthGuard, RolesGuard, FeatureEntitlementGuard)` 순서를 지킨다.
 */
export const RequiresFeature = (featureKey: FeatureKey) =>
  SetMetadata(REQUIRES_FEATURE_KEY, featureKey);
