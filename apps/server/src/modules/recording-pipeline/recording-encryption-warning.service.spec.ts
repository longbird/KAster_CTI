import { Logger } from '@nestjs/common';
import { RecordingEncryptionWarningService } from './recording-encryption-warning.service';

function buildService(options: { envEnabled: boolean; enabledTenants: number; hasKey?: boolean }) {
  const prisma: any = {
    tenantFeatureEntitlements: {
      count: jest.fn().mockResolvedValue(options.enabledTenants),
    },
  };
  const env: Record<string, string> = {
    RECORDING_ENCRYPTION_ENABLED: options.envEnabled ? 'true' : 'false',
    RECORDING_ENCRYPTION_KEY: options.hasKey === false ? '' : 'a'.repeat(64),
  };
  const config: any = { get: (key: string, fallback?: string) => env[key] ?? fallback };
  return { service: new RecordingEncryptionWarningService(prisma, config), prisma };
}

describe('RecordingEncryptionWarningService', () => {
  let error: jest.SpyInstance;

  beforeEach(() => {
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => error.mockRestore());

  it('암호화 자격이 켜진 테넌트가 있는데 env 가 꺼져 있으면 크게 경고한다', async () => {
    const { service } = buildService({ envEnabled: false, enabledTenants: 2 });

    await service.check();

    expect(error).toHaveBeenCalled();
    expect(String(error.mock.calls[0][0])).toContain('RECORDING_ENCRYPTION_ENABLED');
  });

  it('키가 비어 있어도 경고한다', async () => {
    const { service } = buildService({ envEnabled: true, enabledTenants: 1, hasKey: false });

    await service.check();

    expect(String(error.mock.calls[0][0])).toContain('RECORDING_ENCRYPTION_KEY');
  });

  it('둘 다 정상이면 아무 말도 하지 않는다', async () => {
    const { service } = buildService({ envEnabled: true, enabledTenants: 1 });

    await service.check();

    expect(error).not.toHaveBeenCalled();
  });

  it('자격이 켜진 테넌트가 없으면 env 가 꺼져 있어도 정상이다', async () => {
    const { service } = buildService({ envEnabled: false, enabledTenants: 0 });

    await service.check();

    expect(error).not.toHaveBeenCalled();
  });

  it('켜진 자격만 센다', async () => {
    const { service, prisma } = buildService({ envEnabled: false, enabledTenants: 0 });

    await service.check();

    expect(prisma.tenantFeatureEntitlements.count.mock.calls[0][0].where).toEqual({
      featureKey: 'recording-encryption',
      enabled: true,
    });
  });

  // 막으면 키를 잃은 사이트가 아예 못 뜬다. 그건 더 나쁘다.
  it('경고만 하고 부팅을 막지 않는다', async () => {
    const { service } = buildService({ envEnabled: false, enabledTenants: 3 });

    await expect(service.check()).resolves.toBeUndefined();
  });

  it('조회가 실패해도 부팅을 막지 않는다', async () => {
    const { service, prisma } = buildService({ envEnabled: false, enabledTenants: 0 });
    prisma.tenantFeatureEntitlements.count.mockRejectedValue(new Error('db down'));

    await expect(service.check()).resolves.toBeUndefined();
  });
});
