import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { PrismaService } from '../../common/prisma.service';
import { QueuesModule } from '../queues/queues.module';
import { OutboxPublisherService } from './outbox-publisher.service';

@Module({
  imports: [EventsModule, QueuesModule],
  providers: [OutboxPublisherService, PrismaService],
  exports: [OutboxPublisherService],
})
export class OutboxModule {}
