import { PacketCaptureService } from './packet-capture.service';

const TENANT = '11111111-1111-1111-1111-111111111111';
const AUDIT = { agentId: 'agent-1', userRole: 'admin', clientIp: '10.0.0.1', userAgent: 'jest' };

function buildService(overrides: {
  env?: Record<string, string>;
  tenantEnabled?: boolean;
  isLeader?: boolean;
  runningJob?: any;
  interfaces?: string[];
} = {}) {
  const env: Record<string, string> = {
    PACKET_CAPTURE_ENABLED: 'true',
    PACKET_CAPTURE_MAX_DURATION_SECONDS: '600',
    PACKET_CAPTURE_STORAGE_ROOT: '/tmp/kaster-capture-test',
    ...(overrides.env ?? {}),
  };

  const jobs = {
    findFirst: jest.fn().mockResolvedValue(overrides.runningJob ?? null),
    create: jest.fn().mockResolvedValue({ packetCaptureJobId: 'job-1' }),
    update: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  };
  const prisma: any = {
    tenantSystemSettings: {
      findFirst: jest.fn().mockResolvedValue({
        packetCaptureEnabled: overrides.tenantEnabled ?? true,
      }),
      updateMany: jest.fn().mockResolvedValue({}),
    },
    packetCaptureJobs: jobs,
    packetCaptureAccessAuditLogs: { create: jest.fn().mockResolvedValue({}) },
  };

  const config: any = { get: (key: string, fallback?: string) => env[key] ?? fallback };
  const leader: any = { isLeader: () => overrides.isLeader ?? true };
  const captureProcess: any = {
    isAvailable: jest.fn().mockResolvedValue(true),
    listInterfaces: jest.fn().mockResolvedValue(overrides.interfaces ?? ['eth0', 'any']),
    startCapture: jest.fn().mockResolvedValue(undefined),
    stopCapture: jest.fn().mockResolvedValue(undefined),
    getStatus: jest.fn().mockResolvedValue({ available: true, running: null, lastResult: null }),
  };
  const encryption: any = { isEnabled: () => false, encryptFile: jest.fn(), openDecryptedReadStream: jest.fn() };
  const storage: any = { calculateSha256: jest.fn() };

  const service = new PacketCaptureService(prisma, config, leader, captureProcess, encryption, storage);
  return { service, prisma, captureProcess, jobs };
}

describe('PacketCaptureService.startCapture 게이트', () => {
  it('네 게이트를 모두 통과하면 캡처를 띄운다', async () => {
    const { service, captureProcess, jobs } = buildService();

    await service.startCapture(TENANT, { durationSeconds: 60, interfaceName: 'eth0' }, AUDIT);

    expect(captureProcess.startCapture).toHaveBeenCalledTimes(1);
    expect(jobs.create).toHaveBeenCalledTimes(1);
  });

  it('하드 킬스위치가 꺼져 있으면 프로세스를 띄우지 않는다', async () => {
    const { service, captureProcess } = buildService({ env: { PACKET_CAPTURE_ENABLED: 'false' } });

    await expect(
      service.startCapture(TENANT, { durationSeconds: 60 }, AUDIT),
    ).rejects.toThrow(/PACKET_CAPTURE_ENABLED/);
    expect(captureProcess.startCapture).not.toHaveBeenCalled();
  });

  it('테넌트 토글이 꺼져 있으면 거부한다', async () => {
    const { service, captureProcess } = buildService({ tenantEnabled: false });

    await expect(
      service.startCapture(TENANT, { durationSeconds: 60 }, AUDIT),
    ).rejects.toThrow(/꺼져 있습니다/);
    expect(captureProcess.startCapture).not.toHaveBeenCalled();
  });

  it('리더 노드가 아니면 거부한다', async () => {
    const { service, captureProcess } = buildService({ isLeader: false });

    await expect(
      service.startCapture(TENANT, { durationSeconds: 60 }, AUDIT),
    ).rejects.toThrow(/리더/);
    expect(captureProcess.startCapture).not.toHaveBeenCalled();
  });

  it('이미 실행 중인 캡처가 있으면 거부한다', async () => {
    const { service, captureProcess } = buildService({ runningJob: { packetCaptureJobId: 'job-0' } });

    await expect(
      service.startCapture(TENANT, { durationSeconds: 60 }, AUDIT),
    ).rejects.toThrow(/이미 실행 중/);
    expect(captureProcess.startCapture).not.toHaveBeenCalled();
  });

  it('상한을 넘는 캡처 시간을 거부한다', async () => {
    const { service, captureProcess } = buildService();

    await expect(
      service.startCapture(TENANT, { durationSeconds: 601 }, AUDIT),
    ).rejects.toThrow(/최대 600초/);
    expect(captureProcess.startCapture).not.toHaveBeenCalled();
  });

  it('존재하지 않는 인터페이스를 거부한다', async () => {
    const { service, captureProcess } = buildService({ interfaces: ['eth0'] });

    await expect(
      service.startCapture(TENANT, { durationSeconds: 60, interfaceName: 'eth9' }, AUDIT),
    ).rejects.toThrow(/eth9/);
    expect(captureProcess.startCapture).not.toHaveBeenCalled();
  });

  it('셸 메타문자가 든 필터를 거부한다', async () => {
    const { service, captureProcess } = buildService();

    await expect(
      service.startCapture(
        TENANT,
        { durationSeconds: 60, interfaceName: 'eth0', captureFilter: 'udp; rm -rf /' },
        AUDIT,
      ),
    ).rejects.toThrow(/허용되지 않는 문자/);
    expect(captureProcess.startCapture).not.toHaveBeenCalled();
  });

  // 여기서 실패한 채로 RUNNING 행이 남으면 다음 캡처가 "이미 실행 중" 으로 영영 막힌다.
  it('사이드카가 시작을 거절하면 작업을 FAILED 로 마감한다', async () => {
    const { service, captureProcess, jobs } = buildService();
    captureProcess.startCapture.mockRejectedValue(new Error('이미 실행 중인 캡처가 있습니다'));

    await expect(
      service.startCapture(TENANT, { durationSeconds: 60, interfaceName: 'eth0' }, AUDIT),
    ).rejects.toThrow(/캡처를 시작하지 못했습니다/);

    expect(jobs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { packetCaptureJobId: 'job-1' },
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('출력 경로는 서버가 만들며 클라이언트 입력이 섞이지 않는다', async () => {
    const { service, captureProcess } = buildService();

    await service.startCapture(
      TENANT,
      { durationSeconds: 60, interfaceName: 'eth0', captureFilter: 'udp' },
      AUDIT,
    );

    // path.join 은 플랫폼별 구분자를 쓴다. 운영은 Linux 지만 테스트는 Windows 에서도 돈다.
    const { outputPath } = captureProcess.startCapture.mock.calls[0][0];
    expect(outputPath.replace(/\\/g, '/')).toContain('/tmp/kaster-capture-test');
    expect(outputPath).toMatch(/capture-.*\.pcap$/);
  });
});

describe('PacketCaptureService.getSettings', () => {
  it('토글과 함께 현재 캡처 가능 여부를 알려준다', async () => {
    const { service } = buildService();

    const settings = await service.getSettings(TENANT);

    expect(settings).toMatchObject({
      enabled: true,
      hardEnabled: true,
      dumpcapAvailable: true,
      isLeaderNode: true,
      encryptionEnabled: false,
      maxDurationSeconds: 600,
    });
    expect(settings.interfaces).toEqual(['eth0', 'any']);
  });
});
