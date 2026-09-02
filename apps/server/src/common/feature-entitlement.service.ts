import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import {
  FEATURE_KEYS,
  FeatureKey,
  defaultEnabledMap,
  getFeature,
  isFeatureKey,
} from './feature-catalog';

const CACHE_TTL_MS = 30_000;

export interface SetEntitlementInput {
  enabled: boolean;
  platformAdminId: string | null;
  note?: string | null;
  clientIp?: string | null;
  /** 되돌릴 수 없는 기능을 켤 때만 필요하다. 실수로 누른 것과 알고 누른 것을 가른다. */
  acknowledgeIrreversible?: boolean;
}

interface CacheEntry {
  map: Record<FeatureKey, boolean>;
  expiresAt: number;
}

/**
 * 테넌트가 그 기능을 **가질 수 있는지** 판정한다.
 *
 * 이미 있는 세 층(env 킬스위치 / 테넌트 토글 / 메뉴 RBAC) 위의 네 번째 층이다.
 * 앞의 셋은 "켤 것인가" 를 정하고, 이 층은 "켤 수 있는가" 를 정한다.
 * 판정은 여기 한 곳에서만 한다 — 모듈마다 제 방식으로 판단하면 어긋난다.
 *
 * **멀티노드 주의**: 캐시는 노드 로컬이라 다른 노드는 최대 30초 늦게 반영된다.
 * 자격은 초 단위 정합성이 필요한 값이 아니므로 이 지연을 받아들인다.
 */
@Injectable()
export class FeatureEntitlementService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async isEnabled(tenantId: string, featureKey: FeatureKey): Promise<boolean> {
    if (!isFeatureKey(featureKey)) {
      throw new Error(`unknown feature key: ${featureKey}`);
    }
    const map = await this.loadMap(tenantId);
    return map[featureKey];
  }

  async listForTenant(tenantId: string): Promise<Record<FeatureKey, boolean>> {
    return { ...(await this.loadMap(tenantId)) };
  }

  /** 자격이 없는 기능 키. 화면에서 감출 메뉴를 계산하는 입력이다. */
  async listDisabled(tenantId: string): Promise<FeatureKey[]> {
    const map = await this.loadMap(tenantId);
    return FEATURE_KEYS.filter((key) => !map[key]);
  }

  async assertEnabled(tenantId: string, featureKey: FeatureKey): Promise<void> {
    if (await this.isEnabled(tenantId, featureKey)) return;
    throw new ForbiddenException(
      `이 테넌트에는 "${getFeature(featureKey).name}" 기능이 열려 있지 않습니다.`,
    );
  }

  async setEnabled(tenantId: string, featureKey: FeatureKey, input: SetEntitlementInput) {
    const feature = getFeature(featureKey);

    if (feature.irreversible) {
      if (!input.enabled) {
        throw new ConflictException(
          `"${feature.name}" 은 한 번 켜면 끌 수 없습니다. 끄면 암호문과 평문이 섞인 저장소가 됩니다.`,
        );
      }
      if (!input.acknowledgeIrreversible) {
        throw new BadRequestException(
          `"${feature.name}" 은 되돌릴 수 없습니다. acknowledgeIrreversible 을 함께 보내주세요.`,
        );
      }
    }

    const beforeEnabled = await this.isEnabled(tenantId, featureKey);
    const now = new Date();

    const saved = await (this.prisma as any).tenantFeatureEntitlements.upsert({
      where: { tenantId_featureKey: { tenantId, featureKey } },
      create: {
        tenantId,
        featureKey,
        enabled: input.enabled,
        // 켠 시각은 되돌릴 수 없는 기능의 평문/암호문 경계다. 끌 때는 건드리지 않는다.
        enabledAt: input.enabled ? now : null,
        note: input.note ?? null,
        updatedByAdminId: input.platformAdminId,
      },
      update: {
        enabled: input.enabled,
        ...(input.enabled ? { enabledAt: now } : {}),
        note: input.note ?? null,
        updatedByAdminId: input.platformAdminId,
      },
    });

    await (this.prisma as any).tenantFeatureEntitlementAuditLogs.create({
      data: {
        tenantId,
        featureKey,
        platformAdminId: input.platformAdminId,
        beforeEnabled,
        afterEnabled: input.enabled,
        note: input.note ?? null,
        clientIp: input.clientIp ?? null,
      },
    });

    this.invalidate(tenantId);
    return saved;
  }

  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
  }

  private async loadMap(tenantId: string): Promise<Record<FeatureKey, boolean>> {
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.map;
    }

    const rows = await (this.prisma as any).tenantFeatureEntitlements.findMany({
      where: { tenantId },
      select: { featureKey: true, enabled: true },
    });

    const map = defaultEnabledMap();
    for (const row of rows) {
      if (!isFeatureKey(row.featureKey)) continue;
      map[row.featureKey] = row.enabled;
    }

    this.cache.set(tenantId, { map, expiresAt: Date.now() + CACHE_TTL_MS });
    return map;
  }
}
