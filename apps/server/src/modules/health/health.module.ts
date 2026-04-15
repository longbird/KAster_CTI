import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RedisModule } from '../redis/redis.module';
import { AmiModule } from '../ami/ami.module';
import { HealthController } from './health.controller';

@Module({
  imports: [RedisModule, AmiModule],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class HealthModule {}
