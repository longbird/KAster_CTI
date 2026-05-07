import { Module } from '@nestjs/common';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { PrismaService } from '../../common/prisma.service';
import { CallsModule } from '../calls/calls.module';
import { AsteriskConfigModule } from '../asterisk-config/asterisk-config.module';
import { AmiModule } from '../ami/ami.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

@Module({
  imports: [CallsModule, AsteriskConfigModule, AmiModule],
  controllers: [AgentsController],
  providers: [AgentsService, PrismaService, MenuPermissionService],
  exports: [AgentsService],
})
export class AgentsModule {}
