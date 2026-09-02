import { Module } from '@nestjs/common';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { PrismaService } from '../../common/prisma.service';
import { ConsultCategoriesController } from './consult-categories.controller';
import { ConsultCategoriesService } from './consult-categories.service';

@Module({
  controllers: [ConsultCategoriesController],
  providers: [PrismaService, MenuPermissionService, ConsultCategoriesService],
  exports: [ConsultCategoriesService],
})
export class ConsultCategoriesModule {}
