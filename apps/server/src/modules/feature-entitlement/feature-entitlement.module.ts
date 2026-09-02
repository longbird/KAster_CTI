import { Global, Module } from '@nestjs/common';
import { FeatureEntitlementService } from '../../common/feature-entitlement.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * 기능 자격 판정.
 *
 * @Global 인 이유: 서로 의존 관계가 없는 모듈들(calls·trends·ars-flow·packet-capture 등)이
 * 모두 같은 판정 인스턴스를 봐야 한다. 캐시가 인스턴스마다 갈라지면 안 된다.
 * ResilienceModule / RedisModule 과 같은 이유다.
 */
@Global()
@Module({
  providers: [PrismaService, FeatureEntitlementService],
  exports: [FeatureEntitlementService],
})
export class FeatureEntitlementModule {}
