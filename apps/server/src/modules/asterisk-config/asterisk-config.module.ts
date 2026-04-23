import { Module } from '@nestjs/common';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { PrismaService } from '../../common/prisma.service';
import { AmiModule } from '../ami/ami.module';
import { OptOutModule } from '../opt-out/opt-out.module';
import { AsteriskConfigController, AsteriskConfigInternalController } from './asterisk-config.controller';
import { AsteriskConfigService } from './asterisk-config.service';
import { AsteriskReloadService } from './asterisk-reload.service';

@Module({
  imports: [AmiModule, OptOutModule],
  controllers: [AsteriskConfigController, AsteriskConfigInternalController],
  providers: [AsteriskConfigService, AsteriskReloadService, PrismaService, MenuPermissionService],
  exports: [AsteriskReloadService],
})
export class AsteriskConfigModule {}
