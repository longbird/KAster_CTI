import { Module } from '@nestjs/common';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { PrismaService } from '../../common/prisma.service';
import { OutboundRulesController } from './outbound-rules.controller';
import { OutboundRulesService } from './outbound-rules.service';

@Module({
  controllers: [OutboundRulesController],
  providers: [OutboundRulesService, PrismaService, MenuPermissionService],
  exports: [OutboundRulesService],
})
export class OutboundRulesModule {}
