import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigSnapshotService } from './config-snapshot.service';
import { OperatingModeService } from './operating-mode.service';

const TENANT = '00000000-0000-0000-0000-000000000001';

function buildOperatingMode() {
  return new OperatingModeService({ get: (_k: string, d: any) => d } as any);
}

function build(options: { dir: string; redisDown?: boolean; dbDown?: boolean } = { dir: '' }) {
  const redisStore = new Map<string, string>();
  const client = {
    get: jest.fn(async (key: string) => {
      if (options.redisDown) throw new Error('redis down');
      return redisStore.get(key) ?? null;
    }),
    set: jest.fn(async (key: string, value: string) => {
      if (options.redisDown) throw new Error('redis down');
      redisStore.set(key, value);
      return 'OK';
    }),
  };
  const rows: any[] = [];
  const prisma = {
    configVersions: {
      create: jest.fn(async ({ data }: any) => {
        if (options.dbDown) throw new Error('db down');
        rows.push(data);
        return data;
      }),
      findFirst: jest.fn(async () => {
        if (options.dbDown) throw new Error('db down');
        return rows[rows.length - 1] ?? null;
      }),
    },
  };
  const config = {
    get: (key: string, fallback: any) =>
      key === 'RESILIENCE_LKG_DIR' ? options.dir : fallback,
  };
  const operatingMode = buildOperatingMode();
  const service = new ConfigSnapshotService(
    prisma as any,
    { getClient: () => client } as any,
    config as any,
    operatingMode,
  );
  return { service, prisma, client, redisStore, operatingMode, rows };
}

describe('ConfigSnapshotService checksum', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'kcti-lkg-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('키 순서가 달라도 같은 체크섬을 낸다', () => {
    const { service } = build({ dir });

    const a = service.computeChecksum({ b: 2, a: 1, nested: { y: 2, x: 1 } });
    const b = service.computeChecksum({ a: 1, b: 2, nested: { x: 1, y: 2 } });

    expect(a).toBe(b);
  });

  it('값이 달라지면 체크섬이 달라진다', () => {
    const { service } = build({ dir });

    expect(service.computeChecksum({ a: 1 })).not.toBe(service.computeChecksum({ a: 2 }));
  });
});

describe('ConfigSnapshotService 저장', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'kcti-lkg-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('로컬 LKG 파일에 체크섬과 함께 기록한다', async () => {
    const { service } = build({ dir });

    await service.save(TENANT, 'queue', { queues: [{ name: 'q1' }] });

    const raw = JSON.parse(readFileSync(join(dir, `${TENANT}.queue.json`), 'utf8'));
    expect(raw.checksum).toEqual(expect.any(String));
    expect(raw.payload).toEqual({ queues: [{ name: 'q1' }] });
    expect(raw.configType).toBe('queue');
  });

  it('임시 파일을 남기지 않는다 (temp + rename)', async () => {
    const { service } = build({ dir });

    await service.save(TENANT, 'queue', { queues: [] });

    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('비밀번호와 시크릿은 LKG 에 원문으로 남기지 않는다', async () => {
    const { service } = build({ dir });

    await service.save(TENANT, 'pbx', {
      trunk: { host: 'sip.example.com', password: 'super-secret' },
      amiSecret: 'ami-secret',
      nested: [{ authToken: 'tok-1' }],
    });

    const text = readFileSync(join(dir, `${TENANT}.pbx.json`), 'utf8');
    expect(text).not.toContain('super-secret');
    expect(text).not.toContain('ami-secret');
    expect(text).not.toContain('tok-1');
    expect(text).toContain('sip.example.com');
  });

  it('DB 가 죽어 있어도 로컬 LKG 기록은 성공한다', async () => {
    const { service } = build({ dir, dbDown: true });

    await expect(service.save(TENANT, 'queue', { queues: [] })).resolves.toBeDefined();
    expect(readFileSync(join(dir, `${TENANT}.queue.json`), 'utf8')).toContain('checksum');
  });

  it('버전은 저장할 때마다 증가한다', async () => {
    const { service } = build({ dir });

    const first = await service.save(TENANT, 'queue', { queues: [] });
    const second = await service.save(TENANT, 'queue', { queues: [{ name: 'q1' }] });

    expect(second.version).toBe(first.version + 1);
  });
});

describe('ConfigSnapshotService 로드', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'kcti-lkg-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('변조된 LKG 스냅샷을 거부한다', async () => {
    const { service } = build({ dir });
    await service.save(TENANT, 'queue', { queues: [] });

    const path = join(dir, `${TENANT}.queue.json`);
    const snapshot = JSON.parse(readFileSync(path, 'utf8'));
    snapshot.payload = { queues: [{ name: 'injected' }] };
    writeFileSync(path, JSON.stringify(snapshot));

    await expect(service.loadLocalLkg(TENANT, 'queue')).rejects.toThrow('LKG_CHECKSUM_MISMATCH');
  });

  it('메모리 캐시가 있으면 fresh 로 보고한다', async () => {
    const { service, operatingMode } = build({ dir });
    await service.save(TENANT, 'queue', { queues: [] });

    const loaded = await service.load(TENANT, 'queue');

    expect(loaded?.payload).toEqual({ queues: [] });
    expect(operatingMode.snapshot().dataFreshness.config).toBe('fresh');
  });

  it('메모리가 비고 Redis 도 죽으면 로컬 LKG 로 떨어지고 lkg 로 보고한다', async () => {
    const first = build({ dir });
    await first.service.save(TENANT, 'queue', { queues: [{ name: 'q1' }] });

    // 프로세스 재시작 + Redis 장애를 재현한다
    const restarted = build({ dir, redisDown: true, dbDown: true });
    const loaded = await restarted.service.load(TENANT, 'queue');

    expect(loaded?.payload).toEqual({ queues: [{ name: 'q1' }] });
    expect(restarted.operatingMode.snapshot().dataFreshness.config).toBe('lkg');
  });

  it('유효한 LKG 가 없으면 null 을 주고 missing 으로 보고한다', async () => {
    const { service, operatingMode } = build({ dir, redisDown: true, dbDown: true });

    expect(await service.load(TENANT, 'queue')).toBeNull();
    expect(operatingMode.snapshot().dataFreshness.config).toBe('missing');
  });

  it('hasValidLkg 는 유효 LKG 유무를 그대로 반영한다', async () => {
    const { service } = build({ dir });

    expect(await service.hasValidLkg(TENANT, 'queue')).toBe(false);
    await service.save(TENANT, 'queue', { queues: [] });
    expect(await service.hasValidLkg(TENANT, 'queue')).toBe(true);
  });

  it('LKG 나이를 초 단위로 보고한다', async () => {
    const { service } = build({ dir });
    await service.save(TENANT, 'queue', { queues: [] });

    const age = await service.getLkgAgeSeconds(TENANT, 'queue');

    expect(age).toBeGreaterThanOrEqual(0);
    expect(age).toBeLessThan(5);
  });
});
