import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EventsModule } from '../events/events.module';
import { SmdrTcpServerService } from './smdr-tcp-server.service';

@Module({
  imports: [EventsModule],
  providers: [SmdrTcpServerService, PrismaService],
  exports: [SmdrTcpServerService],
})
export class SmdrModule {}
