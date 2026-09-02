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
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { AsteriskConfigModule } from './modules/asterisk-config/asterisk-config.module';
import { AgentUpdatesModule } from './modules/agent-updates/agent-updates.module';
import { SmsTemplatesModule } from './modules/sms-templates/sms-templates.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { OutboundRulesModule } from './modules/outbound-rules/outbound-rules.module';
import { ShareRulesModule } from './modules/share-rules/share-rules.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { RecordingPipelineModule } from './modules/recording-pipeline/recording-pipeline.module';
import { CallAnalysisModule } from './modules/call-analysis/call-analysis.module';
import { ConsultCategoriesModule } from './modules/consult-categories/consult-categories.module';
import { ArsFlowModule } from './modules/ars-flow/ars-flow.module';
import { SmdrModule } from './modules/smdr/smdr.module';
import { TrendsModule } from './modules/trends/trends.module';
import { SipSecurityModule } from './modules/sip-security/sip-security.module';
import { ResilienceModule } from './modules/resilience/resilience.module';
import { FeatureEntitlementModule } from './modules/feature-entitlement/feature-entitlement.module';
import { RecoveryModule } from './modules/resilience/recovery.module';
import { PacketCaptureModule } from './modules/packet-capture/packet-capture.module';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MonitoringModule,
    RedisModule,
    ResilienceModule,
    FeatureEntitlementModule,
    EventsModule,
    OutboxModule,
    SessionRecoveryModule,
    RecordingPipelineModule,
    CallAnalysisModule,
    ConsultCategoriesModule,
    ArsFlowModule,
    SipSecurityModule,
    AmiModule,
    RealtimeModule,
    AuthModule,
    CallsModule,
    AgentsModule,
    CustomersModule,
    QueuesModule,
    AdminModule,
    AnnouncementsModule,
    SmsTemplatesModule,
    AsteriskConfigModule,
    AgentUpdatesModule,
    OutboundRulesModule,
    ShareRulesModule,
    IntegrationsModule,
    SmdrModule,
    TrendsModule,
    PacketCaptureModule,
    PlatformAdminModule,
    RecoveryModule,
    HealthModule,
  ],
  providers: [PrismaService],
})
export class AppModule {}
