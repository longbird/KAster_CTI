import { forwardRef, Module } from '@nestjs/common';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { PrismaService } from '../../common/prisma.service';
import { EventsModule } from '../events/events.module';
import { AmiModule } from '../ami/ami.module';
import { CustomersModule } from '../customers/customers.module';
import { QueuesModule } from '../queues/queues.module';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { SessionEngineService } from './session-engine.service';
import { AgentStateService } from './agent-state.service';
import { AsteriskManagerService } from './asterisk-manager.service';
import { TransferDetectorService } from './transfer-detector.service';

@Module({
  imports: [EventsModule, QueuesModule, CustomersModule, forwardRef(() => AmiModule)],
  controllers: [CallsController],
  providers: [
    CallsService,
    SessionEngineService,
    AgentStateService,
    AsteriskManagerService,
    TransferDetectorService,
    MenuPermissionService,
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
