import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { QueuesModule } from '../queues/queues.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [QueuesModule],
  controllers: [AdminController],
  providers: [AdminService, PrismaService],
})
export class AdminModule {}
