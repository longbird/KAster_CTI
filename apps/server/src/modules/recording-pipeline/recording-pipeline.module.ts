import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EventsModule } from '../events/events.module';
import { RedisModule } from '../redis/redis.module';
import { RecordingEncryptionService } from './recording-encryption.service';
import { RecordingEncryptionWarningService } from './recording-encryption-warning.service';
import { RecordingFinalizerService } from './recording-finalizer.service';
import { RecordingReconcileService } from './recording-reconcile.service';
import { RecordingRetentionService } from './recording-retention.service';
import { RecordingStorageService } from './recording-storage.service';

@Module({
  imports: [EventsModule, RedisModule],
  providers: [
    PrismaService,
    RecordingEncryptionService,
    RecordingEncryptionWarningService,
    RecordingFinalizerService,
    RecordingReconcileService,
    RecordingRetentionService,
    RecordingStorageService,
  ],
  exports: [
    RecordingEncryptionService,
    RecordingFinalizerService,
    RecordingStorageService,
  ],
})
export class RecordingPipelineModule {}
