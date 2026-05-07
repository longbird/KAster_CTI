import { Module } from '@nestjs/common';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { PrismaService } from '../../common/prisma.service';
import { ShareRulesController } from './share-rules.controller';
import { ShareRulesService } from './share-rules.service';

@Module({
  controllers: [ShareRulesController],
  providers: [ShareRulesService, PrismaService, MenuPermissionService],
  exports: [ShareRulesService],
})
export class ShareRulesModule {}
