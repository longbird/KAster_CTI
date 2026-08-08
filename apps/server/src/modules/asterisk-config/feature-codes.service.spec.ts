import { AsteriskConfigService } from './asterisk-config.service';

function buildService(overrides: {
  featureCodeRows?: any[];
  speedDialCodes?: string[];
  extensions?: string[];
  queueExtens?: string[];
  didNumbers?: string[];
} = {}) {
  const rows = overrides.featureCodeRows ?? [];
  const featureCodes = {
    findMany: jest.fn().mockImplementation(({ where }: any) => {
      if (where?.featureKey?.not) {
        return Promise.resolve(rows.filter((row) => row.featureKey !== where.featureKey.not));
      }
      return Promise.resolve(rows);
    }),
    findFirst: jest.fn().mockImplementation(({ where }: any) =>
      Promise.resolve(rows.find((row) => row.featureKey === where.featureKey) ?? null)),
    create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ featureCodeId: 'new', ...data })),
    update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ featureCodeId: 'existing', ...data })),
  };
  const prisma = {
    featureCodes,
    asteriskSpeedDial: {
      findMany: jest.fn().mockResolvedValue((overrides.speedDialCodes ?? []).map((code) => ({ code }))),
    },
    agents: {
      findMany: jest.fn().mockResolvedValue((overrides.extensions ?? []).map((extension) => ({ extension }))),
    },
    queues: {
      findMany: jest.fn().mockResolvedValue((overrides.queueExtens ?? []).map((queueExten) => ({ queueExten }))),
    },
    asteriskDid: {
      findMany: jest.fn().mockResolvedValue((overrides.didNumbers ?? []).map((did) => ({ did }))),
    },
  } as any;
  const reload = { scheduleReload: jest.fn() } as any;
  const service = new AsteriskConfigService(prisma, reload, {} as any, {} as any);
  return { service, prisma, reload, featureCodes };
}

describe('AsteriskConfigService feature codes', () => {
  describe('getFeatureCodes', () => {
    it('저장된 행이 없으면 카탈로그 기본값으로 채워 반환한다', async () => {
      const { service } = buildService();

      const result = await service.getFeatureCodes('tenant-1');

      expect(result.map((row) => row.featureKey))
        .toEqual(['pickup', 'attendedTransferComplete', 'hold', 'resume']);

      const pickup = result.find((row) => row.featureKey === 'pickup')!;
      expect(pickup).toMatchObject({ code: '*8', enabled: true, configured: false, invocation: 'HANDSET_DIAL' });

      // 기본 코드가 없는 기능은 꺼진 상태로 시작한다.
      const hold = result.find((row) => row.featureKey === 'hold')!;
      expect(hold).toMatchObject({ code: null, enabled: false, configured: false, invocation: 'SERVER_DTMF' });
    });

    it('저장된 값이 카탈로그 기본값을 덮어쓴다', async () => {
      const { service } = buildService({
        featureCodeRows: [{ featureKey: 'pickup', code: '*77', enabled: false }],
      });

      const result = await service.getFeatureCodes('tenant-1');
      const pickup = result.find((row) => row.featureKey === 'pickup')!;

      expect(pickup).toMatchObject({ code: '*77', enabled: false, configured: true, defaultCode: '*8' });
    });
  });

  describe('upsertFeatureCode', () => {
    it('신규 저장 후 PBX 재적용을 예약한다', async () => {
      const { service, reload, featureCodes } = buildService();

      await service.upsertFeatureCode('tenant-1', { featureKey: 'pickup', code: ' *8 ' });

      expect(featureCodes.create).toHaveBeenCalledWith({
        data: { tenantId: 'tenant-1', featureKey: 'pickup', code: '*8', enabled: true },
      });
      expect(reload.scheduleReload).toHaveBeenCalledWith('tenant-1');
    });

    it('기존 행이 있으면 갱신한다', async () => {
      const { service, featureCodes } = buildService({
        featureCodeRows: [{ featureCodeId: 'fc-1', featureKey: 'hold', code: '*71', enabled: true }],
      });

      await service.upsertFeatureCode('tenant-1', { featureKey: 'hold', code: '*72' });

      expect(featureCodes.create).not.toHaveBeenCalled();
      expect(featureCodes.update).toHaveBeenCalled();
    });

    it('단축 발신 번호와 겹치면 거부한다', async () => {
      const { service } = buildService({ speedDialCodes: ['*8'] });

      await expect(service.upsertFeatureCode('tenant-1', { featureKey: 'pickup', code: '*8' }))
        .rejects.toThrow('단축 발신');
    });

    it('다른 기능코드와 겹치면 거부한다', async () => {
      const { service } = buildService({
        featureCodeRows: [{ featureKey: 'hold', code: '*8', enabled: true }],
      });

      await expect(service.upsertFeatureCode('tenant-1', { featureKey: 'pickup', code: '*8' }))
        .rejects.toThrow('겹치는');
    });

    it('자기 자신의 기존 코드와는 충돌로 보지 않는다', async () => {
      const { service, featureCodes } = buildService({
        featureCodeRows: [{ featureCodeId: 'fc-1', featureKey: 'pickup', code: '*8', enabled: true }],
      });

      await expect(service.upsertFeatureCode('tenant-1', { featureKey: 'pickup', code: '*8' }))
        .resolves.toBeDefined();
      expect(featureCodes.update).toHaveBeenCalled();
    });

    it('형식이 틀리면 거부한다', async () => {
      const { service } = buildService();

      await expect(service.upsertFeatureCode('tenant-1', { featureKey: 'pickup', code: '8' }))
        .rejects.toThrow('* 또는 #');
    });

    it('코드를 비우면 미설정으로 저장한다', async () => {
      const { service, featureCodes } = buildService();

      await service.upsertFeatureCode('tenant-1', { featureKey: 'hold', code: '', enabled: false });

      expect(featureCodes.create).toHaveBeenCalledWith({
        data: { tenantId: 'tenant-1', featureKey: 'hold', code: null, enabled: false },
      });
    });

    it('필수 기능은 코드 없이 활성화할 수 없다', async () => {
      // 상담 전환 완료는 코드가 없으면 전환 자체가 깨진다.
      const { service } = buildService();

      await expect(service.upsertFeatureCode('tenant-1', {
        featureKey: 'attendedTransferComplete',
        code: '',
        enabled: true,
      })).rejects.toThrow('코드 없이 활성화할 수 없습니다');
    });
  });
});
