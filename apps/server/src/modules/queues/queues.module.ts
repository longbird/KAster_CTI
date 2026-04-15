import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { QueuesController } from './queues.controller';
import { QueuesService } from './queues.service';

@Module({
  controllers: [QueuesController],
  providers: [QueuesService, PrismaService],
  exports: [QueuesService],
})
export class QueuesModule {}
