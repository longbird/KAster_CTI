import * as bcrypt from 'bcryptjs';
import { PlatformAdminBootstrapService } from './platform-admin-bootstrap.service';

function buildService(env: Record<string, string>, prismaOverrides: Record<string, unknown> = {}) {
  const prisma: any = {
    platformAdmins: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ platformAdminId: 'created' }),
      ...prismaOverrides,
    },
  };
  const config: any = { get: (key: string, fallback?: string) => env[key] ?? fallback };
  return { service: new PlatformAdminBootstrapService(prisma, config), prisma };
}

const FULL_ENV = {
  PLATFORM_ADMIN_BOOTSTRAP_LOGIN: 'root',
  PLATFORM_ADMIN_BOOTSTRAP_PASSWORD: 'Password123!',
};

describe('PlatformAdminBootstrapService', () => {
  it('계정이 0건이면 만든다', async () => {
    const { service, prisma } = buildService(FULL_ENV);

    await expect(service.bootstrap()).resolves.toBe('created');
    expect(prisma.platformAdmins.create).toHaveBeenCalled();
  });

  it('만든 계정은 첫 로그인에서 비밀번호를 바꿔야 한다', async () => {
    const { service, prisma } = buildService(FULL_ENV);

    await service.bootstrap();

    const [{ data }] = prisma.platformAdmins.create.mock.calls[0];
    expect(data.loginId).toBe('root');
    expect(data.mustChangePassword).toBe(true);
    await expect(bcrypt.compare('Password123!', data.passwordHash)).resolves.toBe(true);
  });

  it('계정이 이미 있으면 아무것도 하지 않는다', async () => {
    const { service, prisma } = buildService(FULL_ENV, { count: jest.fn().mockResolvedValue(1) });

    await expect(service.bootstrap()).resolves.toBe('existing');
    expect(prisma.platformAdmins.create).not.toHaveBeenCalled();
  });

  // 기존 사이트는 이 env 가 없다. 없다고 부팅이 막히면 안 된다.
  it('env 가 비면 조용히 넘어간다', async () => {
    const { service, prisma } = buildService({});

    await expect(service.bootstrap()).resolves.toBe('skipped');
    expect(prisma.platformAdmins.count).not.toHaveBeenCalled();
  });

  it('한쪽 env 만 있어도 넘어간다', async () => {
    const loginOnly = buildService({ PLATFORM_ADMIN_BOOTSTRAP_LOGIN: 'root' });
    const passwordOnly = buildService({ PLATFORM_ADMIN_BOOTSTRAP_PASSWORD: 'Password123!' });

    await expect(loginOnly.service.bootstrap()).resolves.toBe('skipped');
    await expect(passwordOnly.service.bootstrap()).resolves.toBe('skipped');
  });

  it('공백만 있는 env 도 비어 있는 것으로 본다', async () => {
    const { service } = buildService({
      PLATFORM_ADMIN_BOOTSTRAP_LOGIN: '   ',
      PLATFORM_ADMIN_BOOTSTRAP_PASSWORD: 'Password123!',
    });

    await expect(service.bootstrap()).resolves.toBe('skipped');
  });

  // 마이그레이션 전이거나 DB 가 흔들려도 서버는 떠야 한다.
  it('DB 조회가 실패해도 부팅을 막지 않는다', async () => {
    const { service } = buildService(FULL_ENV, {
      count: jest.fn().mockRejectedValue(new Error('relation does not exist')),
    });

    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it('비밀번호를 로그에 남기지 않는다', async () => {
    const { service } = buildService(FULL_ENV);
    const logged: string[] = [];
    jest.spyOn((service as any).logger, 'warn').mockImplementation((message: any) => {
      logged.push(String(message));
    });
    jest.spyOn((service as any).logger, 'log').mockImplementation((message: any) => {
      logged.push(String(message));
    });

    await service.bootstrap();

    expect(logged.join('\n')).not.toContain('Password123!');
    expect(logged.join('\n')).toContain('root');
  });
});
