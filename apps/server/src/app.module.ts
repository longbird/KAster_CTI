import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './common/prisma.service';
import { AuthModule } from './modules/auth/auth.module';
import { CallsModule } from './modules/calls/calls.module';
import { AgentsModule } from './modules/agents/agents.module';
import { CustomersModule } from './modules/customers/customers.module';
import { QueuesModule } from './modules/queues/queues.module';
import { HealthModule } from './modules/health/health.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { AmiModule } from './modules/ami/ami.module';
import { RedisModule } from './modules/redis/redis.module';
import { EventsModule } from './modules/events/events.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { SessionRecoveryModule } from './modules/session-recovery/session-recovery.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule,
    EventsModule,
    OutboxModule,
    SessionRecoveryModule,
    AmiModule,
    RealtimeModule,
    AuthModule,
    CallsModule,
    AgentsModule,
    CustomersModule,
    QueuesModule,
    AdminModule,
    HealthModule,
  ],
  providers: [PrismaService],
})
export class AppModule {}
