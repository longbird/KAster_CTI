import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalSpoolStore } from './local-spool.store';

const TENANT = '00000000-0000-0000-0000-000000000001';

function record(key: string, overrides: Record<string, any> = {}) {
  return {
    tenantId: TENANT,
    entryType: 'AMI_EVENT',
    idempotencyKey: key,
    linkedid: '1700000000.1',
    uniqueid: '1700000000.1',
    receivedAt: '2026-08-08T00:00:00.000Z',
    payload: { eventName: 'QueueCallerJoin' },
    ...overrides,
  };
}

describe('LocalSpoolStore', () => {
  let dir: string;
  let store: LocalSpoolStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kcti-spool-'));
    store = new LocalSpoolStore({
      get: (key: string, fallback: any) =>
        key === 'RESILIENCE_LOCAL_SPOOL_DIR' ? dir : fallback,
    } as any);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('한 줄에 하나의 JSON 레코드를 append 한다', async () => {
    await store.append(record('fp-1'));
    await store.append(record('fp-2'));

    const lines = readFileSync(store.filePath(TENANT), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).idempotencyKey).toBe('fp-1');
    expect(JSON.parse(lines[1]).idempotencyKey).toBe('fp-2');
  });

  it('append 는 파일 경로와 누적 offset 을 돌려준다', async () => {
    const first = await store.append(record('fp-1'));
    const second = await store.append(record('fp-2'));

    expect(first.path).toBe(store.filePath(TENANT));
    expect(second.offset).toBeGreaterThan(first.offset);
  });

  it('커서 이후의 레코드만 읽는다', async () => {
    await store.append(record('fp-1'));
    const afterFirst = await store.readPending(TENANT);
    expect(afterFirst.records.map((r) => r.idempotencyKey)).toEqual(['fp-1']);

    await store.commitCursor(TENANT, afterFirst.nextOffset);
    await store.append(record('fp-2'));

    const afterCommit = await store.readPending(TENANT);
    expect(afterCommit.records.map((r) => r.idempotencyKey)).toEqual(['fp-2']);
  });

  it('커서를 끝까지 올리면 남은 레코드가 없다', async () => {
    await store.append(record('fp-1'));
    const pending = await store.readPending(TENANT);
    await store.commitCursor(TENANT, pending.nextOffset);

    expect((await store.readPending(TENANT)).records).toEqual([]);
    expect(await store.pendingCount(TENANT)).toBe(0);
  });

  it('스풀 파일이 없으면 빈 결과를 준다', async () => {
    expect((await store.readPending(TENANT)).records).toEqual([]);
    expect(await store.pendingCount(TENANT)).toBe(0);
  });

  it('깨진 줄은 건너뛰고 나머지를 살린다', async () => {
    await store.append(record('fp-1'));
    // 프로세스가 write 중간에 죽어 잘린 줄이 남은 상황
    const { appendFileSync } = await import('fs');
    appendFileSync(store.filePath(TENANT), '{"broken":\n');
    await store.append(record('fp-2'));

    const pending = await store.readPending(TENANT);
    expect(pending.records.map((r) => r.idempotencyKey)).toEqual(['fp-1', 'fp-2']);
  });

  it('테넌트별로 파일을 분리한다', async () => {
    const other = '00000000-0000-0000-0000-000000000002';
    await store.append(record('fp-1'));
    await store.append(record('fp-2', { tenantId: other }));

    expect(await store.pendingCount(TENANT)).toBe(1);
    expect(await store.pendingCount(other)).toBe(1);
  });

  it('경로 조작이 담긴 tenantId 는 거부한다', async () => {
    await expect(store.append(record('fp-1', { tenantId: '../../etc/passwd' })))
      .rejects.toThrow(/tenantId/i);
  });
});

describe('LocalSpoolStore 읽기 비용과 파일 증가', () => {
  let dir: string;
  let store: LocalSpoolStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kcti-spool-'));
    store = new LocalSpoolStore({
      get: (key: string, fallback: any) =>
        key === 'RESILIENCE_LOCAL_SPOOL_DIR' ? dir : fallback,
    } as any);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('커서가 끝까지 올라가 있으면 파일을 읽지 않는다', async () => {
    // /health 는 10~30초마다 폴링된다. 장애가 길어질수록 스풀 파일이 커지는데
    // 그때마다 전체를 다시 읽으면 부하가 필요한 시점에 정확히 몰린다.
    await store.append(record('fp-1'));
    const pending = await store.readPending(TENANT);
    await store.commitCursor(TENANT, pending.nextOffset);

    const fs = await import('fs');
    const readSpy = jest.spyOn(fs.promises, 'readFile');
    try {
      expect(await store.pendingCount(TENANT)).toBe(0);
      // 커서 파일 1회 외에 스풀 본문은 읽지 않아야 한다
      const spoolReads = readSpy.mock.calls.filter(([p]) =>
        String(p).endsWith('-ami.jsonl'),
      );
      expect(spoolReads).toHaveLength(0);
    } finally {
      readSpy.mockRestore();
    }
  });

  it('pendingCount 는 레코드를 파싱하지 않고 센다', async () => {
    await store.append(record('fp-1'));
    await store.append(record('fp-2'));
    const parseSpy = jest.spyOn(JSON, 'parse');
    try {
      expect(await store.pendingCount(TENANT)).toBe(2);
      const parsedSpoolLines = parseSpy.mock.calls.filter(([raw]) =>
        String(raw).includes('idempotencyKey'),
      );
      expect(parsedSpoolLines).toHaveLength(0);
    } finally {
      parseSpy.mockRestore();
    }
  });

  it('전부 처리되면 스풀 파일을 비우고 커서를 되돌린다', async () => {
    // 처리가 끝나도 파일이 계속 자라면 디스크가 결국 찬다.
    await store.append(record('fp-1'));
    await store.append(record('fp-2'));
    const pending = await store.readPending(TENANT);
    await store.commitCursor(TENANT, pending.nextOffset);

    await store.compact(TENANT);

    const { statSync } = await import('fs');
    expect(statSync(store.filePath(TENANT)).size).toBe(0);
    expect(await store.readCursor(TENANT)).toBe(0);
    expect(await store.pendingCount(TENANT)).toBe(0);
  });

  it('미처리 레코드가 남아 있으면 compact 하지 않는다', async () => {
    await store.append(record('fp-1'));

    await store.compact(TENANT);

    expect(await store.pendingCount(TENANT)).toBe(1);
  });

  it('compact 후 이어서 append 한 레코드를 정상적으로 읽는다', async () => {
    await store.append(record('fp-1'));
    const pending = await store.readPending(TENANT);
    await store.commitCursor(TENANT, pending.nextOffset);
    await store.compact(TENANT);

    await store.append(record('fp-2'));

    const after = await store.readPending(TENANT);
    expect(after.records.map((r) => r.idempotencyKey)).toEqual(['fp-2']);
  });
});
