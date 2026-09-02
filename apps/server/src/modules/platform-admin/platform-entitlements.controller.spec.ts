import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FEATURE_CATALOG, FEATURE_KEYS } from '../../common/feature-catalog';
import { PlatformEntitlementsController } from './platform-entitlements.controller';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const REQ = { platformAdmin: { platformAdminId: ADMIN_ID } };
const ENABLED_AT = new Date('2026-09-02T00:00:00Z');

function buildController(options: { rows?: unknown[]; tenant?: unknown; logs?: unknown[] } = {}) {
  const prisma: any = {
    tenants: {
      findUnique: jest.fn().mockResolvedValue(
        options.tenant === undefined ? { tenantId: TENANT_ID } : options.tenant,
      ),
    },
    tenantFeatureEntitlements: { findMany: jest.fn().mockResolvedValue(options.rows ?? []) },
    tenantFeatureEntitlementAuditLogs: { findMany: jest.fn().mockResolvedValue(options.logs ?? []) },
  };
  const entitlement = {
    setEnabled: jest.fn().mockResolvedValue({ enabled: true, enabledAt: ENABLED_AT }),
  } as any;
  return { controller: new PlatformEntitlementsController(prisma, entitlement), prisma, entitlement };
}

describe('PlatformEntitlementsController', () => {
  describe('조회', () => {
    it('행이 없으면 카탈로그 기본값을 출처와 함께 준다', async () => {
      const { controller } = buildController();

      const result = await controller.list(TENANT_ID);

      expect(result.tenantId).toBe(TENANT_ID);
      expect(result.features).toHaveLength(FEATURE_KEYS.length);
      for (const feature of result.features) {
        expect(feature.source).toBe('default');
        expect(feature.enabled).toBe(FEATURE_CATALOG[feature.key].defaultEnabled);
        expect(feature.enabledAt).toBeNull();
      }
    });

    it('행이 있으면 행이 이기고 출처가 row 다', async () => {
      const { controller } = buildController({
        rows: [{ featureKey: 'call-analysis', enabled: true, enabledAt: ENABLED_AT }],
      });

      const result = await controller.list(TENANT_ID);
      const callAnalysis = result.features.find((f) => f.key === 'call-analysis');

      expect(callAnalysis).toMatchObject({
        enabled: true,
        defaultEnabled: false,
        source: 'row',
        enabledAt: ENABLED_AT,
      });
    });

    it('되돌릴 수 없는 기능을 화면이 알 수 있게 함께 준다', async () => {
      const { controller } = buildController();

      const result = await controller.list(TENANT_ID);

      expect(result.features.find((f) => f.key === 'recording-encryption').irreversible).toBe(true);
      expect(result.features.find((f) => f.key === 'packet-capture').irreversible).toBe(false);
    });

    it('테넌트가 없으면 404 다', async () => {
      const { controller } = buildController({ tenant: null });

      await expect(controller.list(TENANT_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('그 테넌트의 행만 읽는다', async () => {
      const { controller, prisma } = buildController();

      await controller.list(TENANT_ID);

      const [{ where }] = prisma.tenantFeatureEntitlements.findMany.mock.calls[0];
      expect(where).toEqual({ tenantId: TENANT_ID });
    });
  });

  describe('변경', () => {
    it('판정 서비스에 넘기고 계약된 형태로 답한다', async () => {
      const { controller, entitlement } = buildController();

      const result = await controller.set(
        TENANT_ID,
        'call-analysis',
        { enabled: true, note: '계약 체결' },
        REQ,
        '10.0.0.1',
      );

      expect(entitlement.setEnabled).toHaveBeenCalledWith(TENANT_ID, 'call-analysis', {
        enabled: true,
        platformAdminId: ADMIN_ID,
        note: '계약 체결',
        clientIp: '10.0.0.1',
        acknowledgeIrreversible: undefined,
      });
      expect(result).toEqual({ key: 'call-analysis', enabled: true, enabledAt: ENABLED_AT });
    });

    it('되돌릴 수 없는 기능의 확인 플래그를 그대로 전달한다', async () => {
      const { controller, entitlement } = buildController();

      await controller.set(
        TENANT_ID,
        'recording-encryption',
        { enabled: true, acknowledgeIrreversible: true },
        REQ,
        undefined,
      );

      const [, , input] = entitlement.setEnabled.mock.calls[0];
      expect(input.acknowledgeIrreversible).toBe(true);
    });

    // 카탈로그에 없는 키를 허용하면 아무도 읽지 않는 자격 행이 조용히 쌓인다.
    it('알 수 없는 기능 키는 400 이다', async () => {
      const { controller, entitlement } = buildController();

      await expect(
        controller.set(TENANT_ID, 'nope', { enabled: true }, REQ, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(entitlement.setEnabled).not.toHaveBeenCalled();
    });

    it('없는 테넌트는 404 이고 아무것도 바꾸지 않는다', async () => {
      const { controller, entitlement } = buildController({ tenant: null });

      await expect(
        controller.set(TENANT_ID, 'call-analysis', { enabled: true }, REQ, undefined),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(entitlement.setEnabled).not.toHaveBeenCalled();
    });
  });

  describe('이력', () => {
    it('최신순으로 준다', async () => {
      const { controller, prisma } = buildController({ logs: [{ auditLogId: 'log-1' }] });

      await expect(controller.history(TENANT_ID, {})).resolves.toEqual([{ auditLogId: 'log-1' }]);

      const [{ where, orderBy, take }] = prisma.tenantFeatureEntitlementAuditLogs.findMany.mock.calls[0];
      expect(where).toEqual({ tenantId: TENANT_ID });
      expect(orderBy).toEqual({ createdAt: 'desc' });
      expect(take).toBe(50);
    });

    it('limit 을 존중한다', async () => {
      const { controller, prisma } = buildController();

      await controller.history(TENANT_ID, { limit: 5 });

      const [{ take }] = prisma.tenantFeatureEntitlementAuditLogs.findMany.mock.calls[0];
      expect(take).toBe(5);
    });

    it('테넌트가 없으면 404 다', async () => {
      const { controller } = buildController({ tenant: null });

      await expect(controller.history(TENANT_ID, {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
