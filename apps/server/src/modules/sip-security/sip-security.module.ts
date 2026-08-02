import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { SipSecurityController } from './sip-security.controller';
import { SipSecurityService } from './sip-security.service';

@Module({
  controllers: [SipSecurityController],
  providers: [PrismaService, SipSecurityService],
  exports: [SipSecurityService],
})
export class SipSecurityModule {}
