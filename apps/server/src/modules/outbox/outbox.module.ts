import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { PrismaService } from '../../common/prisma.service';
import { OutboxPublisherService } from './outbox-publisher.service';

@Module({
  imports: [EventsModule],
  providers: [OutboxPublisherService, PrismaService],
  exports: [OutboxPublisherService],
})
export class OutboxModule {}
