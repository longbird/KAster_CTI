import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { TenantBootstrapService } from './tenant-bootstrap.service';

/** 첫 테넌트·첫 관리자를 env 로 만드는 부팅 훅. 컨트롤러가 없다. */
@Module({
  providers: [PrismaService, TenantBootstrapService],
})
export class TenantBootstrapModule {}
