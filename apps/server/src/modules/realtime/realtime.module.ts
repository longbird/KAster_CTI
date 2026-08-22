import { Module } from '@nestjs/common';
import { AgentPresenceService } from './agent-presence.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  providers: [RealtimeGateway, AgentPresenceService],
  exports: [RealtimeGateway, AgentPresenceService],
})
export class RealtimeModule {}
