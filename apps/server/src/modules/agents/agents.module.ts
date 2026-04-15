import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CallsModule } from '../calls/calls.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

@Module({
  imports: [CallsModule],
  controllers: [AgentsController],
  providers: [AgentsService, PrismaService],
  exports: [AgentsService],
})
export class AgentsModule {}
