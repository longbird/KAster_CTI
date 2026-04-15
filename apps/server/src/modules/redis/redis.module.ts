import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { AmiLeaderElectionService } from './ami-leader-election.service';

@Global()
@Module({
  providers: [RedisService, AmiLeaderElectionService],
  exports: [RedisService, AmiLeaderElectionService],
})
export class RedisModule {}
