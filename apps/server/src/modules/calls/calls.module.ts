import { forwardRef, Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EventsModule } from '../events/events.module';
import { AmiModule } from '../ami/ami.module';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { SessionEngineService } from './session-engine.service';
import { AgentStateService } from './agent-state.service';
import { AsteriskManagerService } from './asterisk-manager.service';
import { TransferDetectorService } from './transfer-detector.service';

@Module({
  imports: [EventsModule, forwardRef(() => AmiModule)],
  controllers: [CallsController],
  providers: [
    CallsService,
    SessionEngineService,
    AgentStateService,
    AsteriskManagerService,
    TransferDetectorService,
    PrismaService,
  ],
  exports: [
    CallsService,
    SessionEngineService,
    AgentStateService,
    AsteriskManagerService,
    TransferDetectorService,
  ],
})
export class CallsModule {}
