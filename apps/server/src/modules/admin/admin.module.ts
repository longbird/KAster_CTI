import { Module } from '@nestjs/common';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { PrismaService } from '../../common/prisma.service';
import { AsteriskConfigModule } from '../asterisk-config/asterisk-config.module';
import { HealthModule } from '../health/health.module';
import { QueuesModule } from '../queues/queues.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [QueuesModule, AsteriskConfigModule, HealthModule, RealtimeModule],
  controllers: [AdminController],
  providers: [AdminService, PrismaService, MenuPermissionService],
})
export class AdminModule {}
