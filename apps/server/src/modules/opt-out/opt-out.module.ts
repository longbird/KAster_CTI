import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { OptOutService } from './opt-out.service';

@Module({
  providers: [OptOutService, PrismaService],
  exports: [OptOutService],
})
export class OptOutModule {}
