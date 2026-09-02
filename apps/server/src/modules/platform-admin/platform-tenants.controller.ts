import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { PrismaService } from '../../common/prisma.service';
import { PlatformAdminGuard } from './platform-admin.guard';

@ApiTags('platform-tenants')
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard)
@Controller('platform/tenants')
export class PlatformTenantsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: '테넌트 목록',
    description:
      '식별에 필요한 네 필드만 준다. 설계 D2 — 플랫폼 관리자는 통화·고객·녹취·상담원 같은 업무 데이터를 읽지 않는다.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  list() {
    return this.prisma.tenants.findMany({
      select: { tenantId: true, tenantCode: true, tenantName: true, isActive: true },
      orderBy: { tenantCode: 'asc' },
    });
  }
}
