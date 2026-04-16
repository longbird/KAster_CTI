import { Module } from '@nestjs/common';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { PrismaService } from '../../common/prisma.service';
import { AsteriskConfigModule } from '../asterisk-config/asterisk-config.module';
import { QueuesController } from './queues.controller';
import { QueuesService } from './queues.service';

@Module({
  imports: [AsteriskConfigModule],
  controllers: [QueuesController],
  providers: [QueuesService, PrismaService, MenuPermissionService],
  exports: [QueuesService],
})
export class QueuesModule {}
