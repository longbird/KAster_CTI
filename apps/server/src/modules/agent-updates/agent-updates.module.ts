import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RedisModule } from '../redis/redis.module';
import { AgentUpdatesController } from './agent-updates.controller';
import { AgentUpdatesService } from './agent-updates.service';

@Module({
  imports: [RedisModule],
  controllers: [AgentUpdatesController],
  providers: [PrismaService, AgentUpdatesService],
  exports: [AgentUpdatesService],
})
export class AgentUpdatesModule {}
