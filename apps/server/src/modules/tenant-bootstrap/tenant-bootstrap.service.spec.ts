import * as bcrypt from 'bcryptjs';
import { BOOTSTRAP_TENANT_ID } from './tenant-bootstrap.constants';
import { TenantBootstrapService } from './tenant-bootstrap.service';

function buildService(env: Record<string, string>, overrides: { tenantCount?: number; failCount?: boolean } = {}) {
  const tx: any = {
    tenants: { create: jest.fn().mockResolvedValue({ tenantId: BOOTSTRAP_TENANT_ID }) },
    agents: { create: jest.fn().mockResolvedValue({ agentId: 'created' }) },
  };
  const prisma: any = {
    tenants: {
      count: overrides.failCount
        ? jest.fn().mockRejectedValue(new Error('relation does not exist'))
        : jest.fn().mockResolvedValue(overrides.tenantCount ?? 0),
    },
    $transaction: jest.fn(async (fn: (client: any) => Promise<unknown>) => fn(tx)),
  };
  const config: any = { get: (key: string, fallback?: string) => env[key] ?? fallback };
  return { service: new TenantBootstrapService(prisma, config), prisma, tx };
}

const FULL_ENV = {
  TENANT_BOOTSTRAP_CODE: 'acme',
  TENANT_BOOTSTRAP_NAME: 'ACME 콜센터',
  TENANT_BOOTSTRAP_ADMIN_LOGIN: 'admin',
  TENANT_BOOTSTRAP_ADMIN_PASSWORD: 'Password123!',
};

describe('TenantBootstrapService', () => {
  it('테넌트가 0건이면 테넌트와 관리자를 함께 만든다', async () => {
    const { service, prisma, tx } = buildService(FULL_ENV);

    await expect(service.bootstrap()).resolves.toBe('created');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.tenants.create).toHaveBeenCalledTimes(1);
    expect(tx.agents.create).toHaveBeenCalledTimes(1);
  });

  // AMI 폴백 테넌트 id 와 같아야 PBX 이벤트가 이 테넌트로 들어온다.
  it('첫 테넌트는 고정 id 로 만든다', async () => {
    const { service, tx } = buildService(FULL_ENV);

    await service.bootstrap();

    const [{ data }] = tx.tenants.create.mock.calls[0];
    expect(data).toMatchObject({
      tenantId: BOOTSTRAP_TENANT_ID,
      tenantCode: 'acme',
      tenantName: 'ACME 콜센터',
    });
  });

  it('관리자는 role=admin 이고 비밀번호는 bcrypt 로 저장한다', async () => {
    const { service, tx } = buildService(FULL_ENV);

    await service.bootstrap();

    const [{ data }] = tx.agents.create.mock.calls[0];
    expect(data).toMatchObject({
      tenantId: BOOTSTRAP_TENANT_ID,
      loginId: 'admin',
      agentCode: 'admin',
      agentName: 'admin',
      extension: '2000',
      role: 'admin',
    });
    expect(data.loginPasswordHash).not.toBe('Password123!');
    await expect(bcrypt.compare('Password123!', data.loginPasswordHash)).resolves.toBe(true);
  });

  it('내선을 env 로 바꿀 수 있다', async () => {
    const { service, tx } = buildService({ ...FULL_ENV, TENANT_BOOTSTRAP_ADMIN_EXTENSION: ' 9000 ' });

    await service.bootstrap();

    expect(tx.agents.create.mock.calls[0][0].data.extension).toBe('9000');
  });

  it('테넌트가 이미 있으면 아무것도 하지 않는다', async () => {
    const { service, prisma, tx } = buildService(FULL_ENV, { tenantCount: 1 });

    await expect(service.bootstrap()).resolves.toBe('existing');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.tenants.create).not.toHaveBeenCalled();
  });

  // 기존 사이트는 이 env 가 없다. 없다고 부팅이 막히면 안 된다.
  it('env 가 비면 조용히 넘어간다', async () => {
    const { service, prisma } = buildService({});

    await expect(service.bootstrap()).resolves.toBe('skipped');
    expect(prisma.tenants.count).not.toHaveBeenCalled();
  });

  it('넷 중 하나만 빠져도 넘어간다', async () => {
    for (const missing of Object.keys(FULL_ENV)) {
      const env = { ...FULL_ENV, [missing]: '   ' };
      const { service, prisma } = buildService(env);
      await expect(service.bootstrap()).resolves.toBe('skipped');
      expect(prisma.tenants.count).not.toHaveBeenCalled();
    }
  });

  it('DB 조회가 실패해도 부팅을 막지 않는다', async () => {
    const { service } = buildService(FULL_ENV, { failCount: true });

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    await expect(service.bootstrap()).resolves.toBe('failed');
  });

  it('비밀번호를 로그에 남기지 않는다', async () => {
    const { service } = buildService(FULL_ENV);
    const logged: string[] = [];
    for (const level of ['warn', 'log', 'error'] as const) {
      jest.spyOn((service as any).logger, level).mockImplementation((message: any) => {
        logged.push(String(message));
      });
    }

    await service.bootstrap();

    expect(logged.join('\n')).not.toContain('Password123!');
    expect(logged.join('\n')).toContain('acme');
    expect(logged.join('\n')).toContain('admin');
  });
});
