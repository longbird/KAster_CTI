import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { EventBusService } from './event-bus.service';

@Module({
  imports: [RealtimeModule],
  providers: [EventBusService],
  exports: [EventBusService],
})
export class EventsModule {}
