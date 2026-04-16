import { Module } from '@nestjs/common';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { PrismaService } from '../../common/prisma.service';
import { AmiModule } from '../ami/ami.module';
import { AsteriskConfigController } from './asterisk-config.controller';
import { AsteriskConfigService } from './asterisk-config.service';
import { AsteriskReloadService } from './asterisk-reload.service';

@Module({
  imports: [AmiModule],
  controllers: [AsteriskConfigController],
  providers: [AsteriskConfigService, AsteriskReloadService, PrismaService, MenuPermissionService],
  exports: [AsteriskReloadService],
})
export class AsteriskConfigModule {}
