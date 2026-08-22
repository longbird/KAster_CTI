import { forwardRef, Module } from '@nestjs/common';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { PrismaService } from '../../common/prisma.service';
import { EventsModule } from '../events/events.module';
import { AmiModule } from '../ami/ami.module';
import { CustomersModule } from '../customers/customers.module';
import { QueuesModule } from '../queues/queues.module';
import { RecordingPipelineModule } from '../recording-pipeline/recording-pipeline.module';
import { CallsController } from './calls.controller';
import { ClientCallCommandsController } from './client-call-commands.controller';
import { CallsService } from './calls.service';
import { SessionEngineService } from './session-engine.service';
import { AgentStateService } from './agent-state.service';
import { AsteriskManagerService } from './asterisk-manager.service';
import { TransferDetectorService } from './transfer-detector.service';
import { AgentOfferService } from './agent-offer.service';
import { AgentOfferController, AgentOfferInternalController } from './agent-offer.controller';

@Module({
  imports: [EventsModule, QueuesModule, CustomersModule, RecordingPipelineModule, forwardRef(() => AmiModule)],
  controllers: [
    CallsController,
    ClientCallCommandsController,
    AgentOfferController,
    AgentOfferInternalController,
  ],
  providers: [
    CallsService,
    AgentOfferService,
    SessionEngineService,
    AgentStateService,
    AsteriskManagerService,
    TransferDetectorService,
    MenuPermissionService,
    PrismaService,
  ],
  exports: [
    CallsService,
    AgentOfferService,
    SessionEngineService,
    AgentStateService,
    AsteriskManagerService,
    TransferDetectorService,
  ],
})
export class CallsModule {}
