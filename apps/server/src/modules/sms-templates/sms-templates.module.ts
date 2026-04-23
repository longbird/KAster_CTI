import { Module } from '@nestjs/common';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { PrismaService } from '../../common/prisma.service';
import { SmsTemplatesController } from './sms-templates.controller';
import { SmsTemplatesService } from './sms-templates.service';

@Module({
  controllers: [SmsTemplatesController],
  providers: [SmsTemplatesService, PrismaService, MenuPermissionService],
  exports: [SmsTemplatesService],
})
export class SmsTemplatesModule {}
