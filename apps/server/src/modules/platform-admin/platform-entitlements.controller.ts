import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Ip,
  NotFoundException,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { FEATURE_CATALOG, FEATURE_KEYS, isFeatureKey } from '../../common/feature-catalog';
import { FeatureEntitlementService } from '../../common/feature-entitlement.service';
import { PrismaService } from '../../common/prisma.service';
import { RequiresWriteAvailability } from '../resilience/write-availability.decorator';
import { EntitlementHistoryQueryDto } from './dto/entitlement-history.query.dto';
import { SetEntitlementDto } from './dto/set-entitlement.dto';
import { PlatformAdminGuard } from './platform-admin.guard';

const DEFAULT_HISTORY_LIMIT = 50;

@ApiTags('platform-entitlements')
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard)
@Controller('platform/tenants')
@RequiresWriteAvailability('general')
// 자격 변경은 설정 쓰기다. 조회는 WriteAvailabilityGuard 를 그대로 통과한다.
export class PlatformEntitlementsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlement: FeatureEntitlementService,
  ) {}

  @Get(':tenantId/entitlements')
  @ApiOperation({
    summary: '테넌트 기능 자격 조회',
    description: '카탈로그 전체를 현재 값·기본값·출처(행/기본값)와 함께 준다. 행이 없으면 기본값으로 판정된다.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  async list(@Param('tenantId') tenantId: string) {
    await this.assertTenant(tenantId);

    const rows = await (this.prisma as any).tenantFeatureEntitlements.findMany({
      where: { tenantId },
      select: { featureKey: true, enabled: true, enabledAt: true },
    });
    const byKey = new Map<string, any>(rows.map((row: any) => [row.featureKey, row]));

    return {
      tenantId,
      features: FEATURE_KEYS.map((key) => {
        const feature = FEATURE_CATALOG[key];
        const row = byKey.get(key);
        return {
          key,
          name: feature.name,
          description: feature.description,
          enabled: row ? row.enabled : feature.defaultEnabled,
          defaultEnabled: feature.defaultEnabled,
          irreversible: feature.irreversible,
          // 화면이 "명시적으로 정해진 값" 과 "아직 안 건드린 기본값" 을 구분해 보여야 한다.
          source: row ? 'row' : 'default',
          enabledAt: row?.enabledAt ?? null,
        };
      }),
    };
  }

  @Put(':tenantId/entitlements/:featureKey')
  @ApiOperation({
    summary: '테넌트 기능 자격 변경',
    description:
      '되돌릴 수 없는 기능은 끄기를 409 로 거부하고, 켤 때 acknowledgeIrreversible 이 없으면 400 이다. '
      + '변경은 감사 로그로 남고 해당 테넌트의 판정 캐시가 즉시 무효화된다.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  async set(
    @Param('tenantId') tenantId: string,
    @Param('featureKey') featureKey: string,
    @Body() dto: SetEntitlementDto,
    @Req() req: any,
    @Ip() clientIp?: string,
  ) {
    // 카탈로그에 없는 키를 받아주면 아무도 읽지 않는 자격 행이 조용히 쌓인다.
    if (!isFeatureKey(featureKey)) {
      throw new BadRequestException(`알 수 없는 기능 키입니다: ${featureKey}`);
    }
    await this.assertTenant(tenantId);

    const saved = await this.entitlement.setEnabled(tenantId, featureKey, {
      enabled: dto.enabled,
      platformAdminId: req.platformAdmin.platformAdminId,
      note: dto.note ?? null,
      clientIp: clientIp ?? null,
      acknowledgeIrreversible: dto.acknowledgeIrreversible,
    });

    return { key: featureKey, enabled: saved.enabled, enabledAt: saved.enabledAt ?? null };
  }

  @Get(':tenantId/entitlements/history')
  @ApiOperation({ summary: '테넌트 기능 자격 변경 이력', description: '누가 언제 무엇을 어떻게 바꿨는지.' })
  @ApiOkResponse({ type: ApiResponseDto })
  async history(@Param('tenantId') tenantId: string, @Query() query: EntitlementHistoryQueryDto) {
    await this.assertTenant(tenantId);

    return (this.prisma as any).tenantFeatureEntitlementAuditLogs.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? DEFAULT_HISTORY_LIMIT,
      select: {
        auditLogId: true,
        featureKey: true,
        beforeEnabled: true,
        afterEnabled: true,
        note: true,
        platformAdminId: true,
        createdAt: true,
      },
    });
  }

  /** 없는 테넌트에 자격을 걸면 FK 오류가 나기 전까지 아무도 눈치채지 못한다. */
  private async assertTenant(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenants.findUnique({
      where: { tenantId },
      select: { tenantId: true },
    });
    if (!tenant) {
      throw new NotFoundException('테넌트를 찾을 수 없습니다.');
    }
  }
}
