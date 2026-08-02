import { forwardRef, Module } from '@nestjs/common';
import { CallsModule } from '../calls/calls.module';
import { SipSecurityModule } from '../sip-security/sip-security.module';
import { AmiConnectionService } from './ami-connection.service';
import { AmiEventNormalizerService } from './ami-event-normalizer.service';

@Module({
  imports: [forwardRef(() => CallsModule), SipSecurityModule],
  providers: [AmiConnectionService, AmiEventNormalizerService],
  exports: [AmiConnectionService, AmiEventNormalizerService],
})
export class AmiModule {}
