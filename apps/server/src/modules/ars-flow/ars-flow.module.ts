import { Module } from '@nestjs/common';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { PrismaService } from '../../common/prisma.service';
import { ArsFlowController } from './ars-flow.controller';
import { ArsFlowService } from './ars-flow.service';

@Module({
  controllers: [ArsFlowController],
  providers: [PrismaService, MenuPermissionService, ArsFlowService],
  exports: [ArsFlowService],
})
export class ArsFlowModule {}
