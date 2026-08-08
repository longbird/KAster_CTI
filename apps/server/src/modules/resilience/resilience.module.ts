import { Global, Module } from '@nestjs/common';
import { OperatingModeService } from './operating-mode.service';
import { LocalSpoolStore } from './local-spool.store';
import { DurableSpoolService } from './durable-spool.service';
import { WriteAvailabilityGuard } from './write-availability.guard';

/**
 * DB 장애 대응 레이어.
 *
 * @Global 인 이유: 운영 모드는 프로세스 단일 상태이고, AMI/Calls/Admin/Health 등
 * 서로 의존 관계가 없는 모듈들이 모두 같은 인스턴스를 봐야 한다. RedisModule 과 같은 이유.
 */
@Global()
@Module({
  providers: [OperatingModeService, WriteAvailabilityGuard, LocalSpoolStore, DurableSpoolService],
  exports: [OperatingModeService, WriteAvailabilityGuard, LocalSpoolStore, DurableSpoolService],
})
export class ResilienceModule {}
