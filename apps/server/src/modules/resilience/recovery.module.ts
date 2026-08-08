import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AmiModule } from '../ami/ami.module';
import { CallsModule } from '../calls/calls.module';
import { RecoveryCoordinatorService } from './recovery-coordinator.service';
import { ReplayBatchRepository } from './replay-batch.repository';
import { RecoverySweeperService } from './recovery-sweeper.service';

/**
 * ResilienceModule 과 분리한 이유는 의존 방향이다.
 *
 * ResilienceModule 은 @Global 이고 AmiModule/CallsModule 이 그것을 소비한다.
 * Recovery Coordinator 는 반대로 AmiConnectionService 와 SessionEngineService 를
 * 소비하므로, 같은 모듈에 두면 ResilienceModule ↔ AmiModule 순환이 생긴다.
 * 소비 방향이 다른 것을 별도 모듈로 떼어내면 forwardRef 없이 끝난다.
 */
@Module({
  imports: [AmiModule, CallsModule],
  providers: [RecoveryCoordinatorService, ReplayBatchRepository, RecoverySweeperService, PrismaService],
  exports: [RecoveryCoordinatorService, ReplayBatchRepository],
})
export class RecoveryModule {}
