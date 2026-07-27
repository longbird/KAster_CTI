import { Module } from '@nestjs/common';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { PrismaService } from '../../common/prisma.service';
import { AmiModule } from '../ami/ami.module';
import { OptOutModule } from '../opt-out/opt-out.module';
import { SmartArsModule } from '../smart-ars/smart-ars.module';
import { AsteriskConfigController, AsteriskConfigInternalController, SmartArsInternalController } from './asterisk-config.controller';
import { AsteriskConfigService } from './asterisk-config.service';
import { AsteriskReloadService } from './asterisk-reload.service';
import { PromptTtsService } from './prompt-tts.service';

@Module({
  imports: [AmiModule, OptOutModule, SmartArsModule],
  controllers: [AsteriskConfigController, AsteriskConfigInternalController, SmartArsInternalController],
  providers: [AsteriskConfigService, AsteriskReloadService, PromptTtsService, PrismaService, MenuPermissionService],
  exports: [AsteriskReloadService],
})
export class AsteriskConfigModule {}
