import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { RecordingPipelineModule } from '../recording-pipeline/recording-pipeline.module';
import { RedisModule } from '../redis/redis.module';
import { CaptureProcessService } from './capture-process.service';
import { CaptureRetentionService } from './capture-retention.service';
import { PacketCaptureController } from './packet-capture.controller';
import { PacketCaptureService } from './packet-capture.service';

@Module({
  // 암호화·해시는 녹취 파이프라인 서비스를 그대로 재사용한다. 새로 만들지 않는다.
  imports: [RedisModule, RecordingPipelineModule],
  controllers: [PacketCaptureController],
  providers: [
    PrismaService,
    MenuPermissionService,
    CaptureProcessService,
    CaptureRetentionService,
    PacketCaptureService,
  ],
})
export class PacketCaptureModule {}
