import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EventsModule } from '../events/events.module';
import { SessionRecoverySweeperService } from './finalizer/session-recovery-sweeper.service';

@Module({
  imports: [EventsModule],
  providers: [SessionRecoverySweeperService, PrismaService],
  exports: [SessionRecoverySweeperService],
})
export class SessionRecoveryModule {}
