import { ConflictException, ForbiddenException } from '@nestjs/common';
import { FEATURE_KEYS } from './feature-catalog';
import { FeatureEntitlementService } from './feature-entitlement.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_TENANT_ID = '00000000-0000-0000-0000-000000000002';
const ADMIN_ID = '00000000-0000-0000-0000-0000000000a1';

function buildService(rows: Array<Record<string, unknown>> = []) {
  const state = { upserts: [] as any[], audits: [] as any[] };
  const store = [...rows];
  const prisma: any = {
    tenantFeatureEntitlements: {
      findMany: jest.fn().mockImplementation(async (args: any) =>
        store.filter((row) => row.tenantId === args.where.tenantId),
      ),
      findFirst: jest.fn().mockImplementation(async (args: any) =>
        store.find(
          (row) => row.tenantId === args.where.tenantId && row.featureKey === args.where.featureKey,
        ) ?? null,
      ),
      upsert: jest.fn().mockImplementation(async (args: any) => {
        state.upserts.push(args);
        const key = args.where.tenantId_featureKey;
        const index = store.findIndex(
          (row) => row.tenantId === key.tenantId && row.featureKey === key.featureKey,
        );
        if (index >= 0) store[index] = { ...store[index], ...args.update };
        else store.push({ ...args.create });
        return store[index >= 0 ? index : store.length - 1];
      }),
    },
    tenantFeatureEntitlementAuditLogs: {
      create: jest.fn().mockImplementation(async (args: any) => {
        state.audits.push(args.data);
        return args.data;
      }),
    },
  };

  return { service: new FeatureEntitlementService(prisma), prisma, state, store };
}

function row(featureKey: string, enabled: boolean, tenantId = TENANT_ID) {
  return { tenantId, featureKey, enabled, enabledAt: enabled ? new Date() : null };
}

describe('FeatureEntitlementService', () => {
  describe('기본값 판정', () => {
    it('행이 없으면 카탈로그 기본값을 쓴다', async () => {
      const { service } = buildService();

      await expect(service.isEnabled(TENANT_ID, 'packet-capture')).resolves.toBe(true);
      await expect(service.isEnabled(TENANT_ID, 'call-analysis')).resolves.toBe(false);
    });

    it('행이 있으면 행이 이긴다', async () => {
      const { service } = buildService([row('packet-capture', false), row('call-analysis', true)]);

      await expect(service.isEnabled(TENANT_ID, 'packet-capture')).resolves.toBe(false);
      await expect(service.isEnabled(TENANT_ID, 'call-analysis')).resolves.toBe(true);
    });

    it('다른 테넌트의 행에 영향받지 않는다', async () => {
      const { service } = buildService([row('call-analysis', true, OTHER_TENANT_ID)]);

      await expect(service.isEnabled(TENANT_ID, 'call-analysis')).resolves.toBe(false);
    });

    it('listForTenant 는 모든 기능을 채워서 준다', async () => {
      const { service } = buildService([row('call-analysis', true)]);

      const map = await service.listForTenant(TENANT_ID);

      expect(map['call-analysis']).toBe(true);
      expect(map['packet-capture']).toBe(true);
      expect(map['ai-insights']).toBe(false);
      // 카탈로그에 기능을 더할 때마다 이 숫자를 고치게 두지 않는다.
      expect(Object.keys(map)).toHaveLength(FEATURE_KEYS.length);
    });

    it('자격 없는 기능 목록을 준다', async () => {
      const { service } = buildService();

      await expect(service.listDisabled(TENANT_ID)).resolves.toEqual(
        expect.arrayContaining(['call-analysis', 'ai-insights', 'ars-flow-builder', 'recording-encryption']),
      );
      await expect(service.listDisabled(TENANT_ID)).resolves.not.toContain('packet-capture');
    });
  });

  describe('assertEnabled', () => {
    it('자격이 있으면 통과한다', async () => {
      const { service } = buildService();

      await expect(service.assertEnabled(TENANT_ID, 'packet-capture')).resolves.toBeUndefined();
    });

    it('자격이 없으면 403 이고 기능 이름을 담는다', async () => {
      const { service } = buildService();

      await expect(service.assertEnabled(TENANT_ID, 'call-analysis')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.assertEnabled(TENANT_ID, 'call-analysis')).rejects.toThrow(/통화 AI 분석/);
    });
  });

  describe('캐시', () => {
    it('같은 테넌트를 다시 물으면 DB 를 다시 읽지 않는다', async () => {
      const { service, prisma } = buildService();

      await service.isEnabled(TENANT_ID, 'call-analysis');
      await service.isEnabled(TENANT_ID, 'packet-capture');

      expect(prisma.tenantFeatureEntitlements.findMany).toHaveBeenCalledTimes(1);
    });

    it('테넌트가 다르면 따로 읽는다', async () => {
      const { service, prisma } = buildService();

      await service.isEnabled(TENANT_ID, 'call-analysis');
      await service.isEnabled(OTHER_TENANT_ID, 'call-analysis');

      expect(prisma.tenantFeatureEntitlements.findMany).toHaveBeenCalledTimes(2);
    });

    it('변경하면 그 테넌트 캐시가 즉시 무효화된다', async () => {
      const { service } = buildService();
      await service.isEnabled(TENANT_ID, 'call-analysis');

      await service.setEnabled(TENANT_ID, 'call-analysis', { enabled: true, platformAdminId: ADMIN_ID });

      await expect(service.isEnabled(TENANT_ID, 'call-analysis')).resolves.toBe(true);
    });

    it('한 테넌트를 바꿔도 다른 테넌트 캐시는 남는다', async () => {
      const { service, prisma } = buildService();
      await service.isEnabled(OTHER_TENANT_ID, 'call-analysis');

      // setEnabled 는 이전값을 남기려고 대상 테넌트를 정당하게 한 번 읽는다.
      // 여기서 보려는 것은 "다른 테넌트 캐시가 살아남는가" 다.
      await service.setEnabled(TENANT_ID, 'call-analysis', { enabled: true, platformAdminId: ADMIN_ID });
      await service.isEnabled(OTHER_TENANT_ID, 'call-analysis');

      const otherTenantReads = prisma.tenantFeatureEntitlements.findMany.mock.calls.filter(
        (call: any[]) => call[0].where.tenantId === OTHER_TENANT_ID,
      );
      expect(otherTenantReads).toHaveLength(1);
    });
  });

  describe('setEnabled', () => {
    it('켜면 켠 시각을 남긴다', async () => {
      const { service, state } = buildService();

      await service.setEnabled(TENANT_ID, 'call-analysis', { enabled: true, platformAdminId: ADMIN_ID });

      expect(state.upserts[0].create.enabledAt).toBeInstanceOf(Date);
    });

    it('끄면 켠 시각을 지우지 않는다', async () => {
      const enabledAt = new Date('2026-01-01T00:00:00Z');
      const { service, state } = buildService([
        { tenantId: TENANT_ID, featureKey: 'call-analysis', enabled: true, enabledAt },
      ]);

      await service.setEnabled(TENANT_ID, 'call-analysis', { enabled: false, platformAdminId: ADMIN_ID });

      expect(state.upserts[0].update.enabledAt).toBeUndefined();
    });

    it('변경 이력을 남긴다', async () => {
      const { service, state } = buildService([row('call-analysis', false)]);

      await service.setEnabled(TENANT_ID, 'call-analysis', {
        enabled: true,
        platformAdminId: ADMIN_ID,
        note: '계약 체결',
        clientIp: '10.0.0.1',
      });

      expect(state.audits[0]).toMatchObject({
        tenantId: TENANT_ID,
        featureKey: 'call-analysis',
        platformAdminId: ADMIN_ID,
        beforeEnabled: false,
        afterEnabled: true,
        note: '계약 체결',
        clientIp: '10.0.0.1',
      });
    });

    it('행이 없던 상태의 이전값은 기본값으로 기록한다', async () => {
      const { service, state } = buildService();

      await service.setEnabled(TENANT_ID, 'packet-capture', { enabled: false, platformAdminId: ADMIN_ID });

      expect(state.audits[0].beforeEnabled).toBe(true);
    });
  });

  describe('되돌릴 수 없는 기능', () => {
    // 암호화는 평문을 지우므로 끄는 것은 되돌리기가 아니라 혼합 저장소를 만드는 일이다.
    it('끄려는 요청은 409 로 거부하고 아무것도 쓰지 않는다', async () => {
      const { service, state } = buildService([row('recording-encryption', true)]);

      await expect(
        service.setEnabled(TENANT_ID, 'recording-encryption', { enabled: false, platformAdminId: ADMIN_ID }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(state.upserts).toHaveLength(0);
      expect(state.audits).toHaveLength(0);
    });

    it('확인 없이 켜려는 요청도 거부한다', async () => {
      const { service, state } = buildService();

      await expect(
        service.setEnabled(TENANT_ID, 'recording-encryption', { enabled: true, platformAdminId: ADMIN_ID }),
      ).rejects.toThrow(/acknowledgeIrreversible/);

      expect(state.upserts).toHaveLength(0);
    });

    it('확인하면 켤 수 있다', async () => {
      const { service, state } = buildService();

      await service.setEnabled(TENANT_ID, 'recording-encryption', {
        enabled: true,
        platformAdminId: ADMIN_ID,
        acknowledgeIrreversible: true,
      });

      expect(state.upserts[0].create.enabled).toBe(true);
      expect(state.upserts[0].create.enabledAt).toBeInstanceOf(Date);
    });

    it('되돌릴 수 있는 기능은 확인 없이 켜고 끌 수 있다', async () => {
      const { service, state } = buildService([row('packet-capture', true)]);

      await service.setEnabled(TENANT_ID, 'packet-capture', { enabled: false, platformAdminId: ADMIN_ID });

      expect(state.upserts[0].update.enabled).toBe(false);
    });

    // 판정 로직이 특정 기능 키 이름을 알면 안 된다. 카탈로그 속성만 본다.
    it('거부 판단은 카탈로그의 irreversible 만 본다', async () => {
      const { service } = buildService();

      await expect(
        service.setEnabled(TENANT_ID, 'call-analysis', { enabled: false, platformAdminId: ADMIN_ID }),
      ).resolves.toBeDefined();
    });
  });

  it('모르는 기능 키는 그 값을 담아 던진다', async () => {
    const { service } = buildService();

    await expect(service.isEnabled(TENANT_ID, 'ghost' as any)).rejects.toThrow(/ghost/);
  });
});
