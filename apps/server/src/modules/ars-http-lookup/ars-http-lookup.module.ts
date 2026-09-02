import { Module } from '@nestjs/common';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { PrismaService } from '../../common/prisma.service';
import { ArsHttpEndpointsController } from './ars-http-endpoints.controller';
import { ArsHttpEndpointsService } from './ars-http-endpoints.service';
import { ArsHttpLookupService } from './ars-http-lookup.service';

@Module({
  controllers: [ArsHttpEndpointsController],
  providers: [PrismaService, MenuPermissionService, ArsHttpLookupService, ArsHttpEndpointsService],
  // P2 의 AGI 내부 엔드포인트가 조회 서비스를 그대로 쓴다.
  exports: [ArsHttpLookupService],
})
export class ArsHttpLookupModule {}
