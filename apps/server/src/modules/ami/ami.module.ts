import { forwardRef, Module } from '@nestjs/common';
import { CallsModule } from '../calls/calls.module';
import { AmiConnectionService } from './ami-connection.service';
import { AmiEventNormalizerService } from './ami-event-normalizer.service';

@Module({
  imports: [forwardRef(() => CallsModule)],
  providers: [AmiConnectionService, AmiEventNormalizerService],
  exports: [AmiConnectionService, AmiEventNormalizerService],
})
export class AmiModule {}
