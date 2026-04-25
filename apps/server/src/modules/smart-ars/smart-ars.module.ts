import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { OptOutModule } from '../opt-out/opt-out.module';
import { SmartArsRuntimeService } from './smart-ars-runtime.service';

@Module({
  imports: [ConfigModule, OptOutModule],
  providers: [SmartArsRuntimeService, PrismaService],
  exports: [SmartArsRuntimeService],
})
export class SmartArsModule {}
