import { Module } from '@nestjs/common';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { PrismaService } from '../../common/prisma.service';
import { AsteriskConfigModule } from '../asterisk-config/asterisk-config.module';
import { QueuesModule } from '../queues/queues.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [QueuesModule, AsteriskConfigModule],
  controllers: [AdminController],
  providers: [AdminService, PrismaService, MenuPermissionService],
})
export class AdminModule {}
