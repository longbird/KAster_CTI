import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';

const DEFAULT_SPOOL_DIR = './var/spool/kcti';
const UUID_RE = /^[0-9a-fA-F-]{36}$/;

export interface SpoolRecord {
  tenantId: string;
  entryType: string;
  idempotencyKey: string;
  linkedid?: string | null;
  uniqueid?: string | null;
  receivedAt: string;
  payload: Record<string, any>;
}

export interface LocalAppendResult {
  path: string;
  offset: number;
}

export interface LocalPendingResult {
  records: SpoolRecord[];
  nextOffset: number;
}

/**
 * Redis 까지 죽었을 때의 최후 보루. append-only JSONL + fsync.
 *
 * 왜 파일인가: Redis 와 DB 가 동시에 죽어도 AMI 이벤트는 계속 들어온다. 프로세스가
 * 재시작해도 살아남아야 하므로 메모리 큐로는 안 된다.
 *
 * 왜 JSONL 인가: append 만으로 쓰기가 끝나고, 중간에 프로세스가 죽어도 마지막 한 줄만
 * 손상된다. 손상된 줄은 읽을 때 건너뛴다.
 */
@Injectable()
export class LocalSpoolStore {
  private readonly logger = new Logger(LocalSpoolStore.name);
  private readonly dir: string;

  constructor(private readonly config: ConfigService) {
    this.dir = resolve(
      this.config.get<string>('RESILIENCE_LOCAL_SPOOL_DIR', DEFAULT_SPOOL_DIR),
    );
  }

  filePath(tenantId: string): string {
    return join(this.dir, `${this.assertTenantId(tenantId)}-ami.jsonl`);
  }

  private cursorPath(tenantId: string): string {
    return join(this.dir, `${this.assertTenantId(tenantId)}-ami.cursor`);
  }

  /**
   * tenantId 가 파일명이 되므로 경로 조작을 막는다. 정규화 단계에서 온 값이라
   * 신뢰할 수 있어 보이지만, AMI 이벤트의 TenantId 필드는 외부 입력이다.
   */
  private assertTenantId(tenantId: string): string {
    if (!UUID_RE.test(tenantId ?? '')) {
      throw new Error(`invalid tenantId for spool path: ${tenantId}`);
    }
    return tenantId;
  }

  async append(record: SpoolRecord): Promise<LocalAppendResult> {
    const path = this.filePath(record.tenantId);
    await fs.mkdir(this.dir, { recursive: true });

    const line = `${JSON.stringify(record)}\n`;
    const handle = await fs.open(path, 'a');
    try {
      await handle.write(line);
      // fsync 없이는 OS 버퍼에만 남아 정전/강제종료 시 사라진다.
      // 이 스토어의 존재 이유가 그 상황이므로 비용을 감수한다.
      await handle.sync();
    } finally {
      await handle.close();
    }

    const { size } = await fs.stat(path);
    return { path, offset: size };
  }

  /**
   * 커서 이후 구간만 읽는다.
   *
   * 파일 전체를 읽지 않는 이유는 성능이 아니라 타이밍이다. /health 가 10~30초마다
   * 이걸 호출하는데, 스풀이 커지는 시점은 정확히 장애 중이다. 그때 수십 MB 를 매번
   * 다시 읽고 파싱하면 이미 힘든 시스템에 부하를 얹는다.
   */
  async readPending(tenantId: string): Promise<LocalPendingResult> {
    const cursor = await this.readCursor(tenantId);
    const size = await this.fileSize(tenantId);
    if (size === null) return { records: [], nextOffset: 0 };
    if (cursor >= size) return { records: [], nextOffset: size };

    const length = size - cursor;
    const buffer = Buffer.allocUnsafe(length);
    const handle = await fs.open(this.filePath(tenantId), 'r');
    try {
      await handle.read(buffer, 0, length, cursor);
    } finally {
      await handle.close();
    }

    const records: SpoolRecord[] = [];
    for (const line of buffer.toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line) as SpoolRecord);
      } catch {
        // 프로세스가 write 중간에 죽어 잘린 줄. 건너뛰고 나머지를 살린다.
        this.logger.warn(`skipping corrupt spool line for tenant=${tenantId}`);
      }
    }

    return { records, nextOffset: size };
  }

  /** 개수만 필요하면 JSON.parse 까지 갈 이유가 없다. 줄 수만 센다. */
  async pendingCount(tenantId: string): Promise<number> {
    const cursor = await this.readCursor(tenantId);
    const size = await this.fileSize(tenantId);
    if (size === null || cursor >= size) return 0;

    const length = size - cursor;
    const buffer = Buffer.allocUnsafe(length);
    const handle = await fs.open(this.filePath(tenantId), 'r');
    try {
      await handle.read(buffer, 0, length, cursor);
    } finally {
      await handle.close();
    }

    let count = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      if (buffer[i] === 0x0a) count += 1;
    }
    return count;
  }

  private async fileSize(tenantId: string): Promise<number | null> {
    try {
      return (await fs.stat(this.filePath(tenantId))).size;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  /**
   * 전부 처리된 스풀 파일을 비우고 커서를 0 으로 되돌린다.
   *
   * 처리가 끝나도 append-only 파일은 계속 자란다. 장애가 반복되면 결국 디스크가 찬다.
   * 미처리 레코드가 하나라도 남아 있으면 건드리지 않는다 — 자르는 순간 유실이다.
   */
  async compact(tenantId: string): Promise<void> {
    const cursor = await this.readCursor(tenantId);
    const size = await this.fileSize(tenantId);
    if (size === null || size === 0) return;
    if (cursor < size) return;

    // truncate 먼저, 커서 리셋 나중. 순서가 반대면 그 사이에 죽었을 때
    // 커서 0 + 옛 데이터가 남아 이미 처리한 이벤트를 통째로 재처리한다.
    await fs.truncate(this.filePath(tenantId), 0);
    await this.commitCursor(tenantId, 0);
  }

  async readCursor(tenantId: string): Promise<number> {
    try {
      const raw = await fs.readFile(this.cursorPath(tenantId), 'utf8');
      const parsed = Number.parseInt(raw.trim(), 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }

  /** temp + rename 으로 원자적으로 갱신한다. 커서가 찢어지면 재처리 범위를 잃는다. */
  async commitCursor(tenantId: string, offset: number): Promise<void> {
    const path = this.cursorPath(tenantId);
    const tmp = `${path}.tmp`;
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(tmp, String(offset), 'utf8');
    await fs.rename(tmp, path);
  }

  /** 스풀 파일이 있는 테넌트 목록. 재시작 후 복구 대상을 찾을 때 쓴다. */
  async listTenants(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.dir);
      return entries
        .filter((name) => name.endsWith('-ami.jsonl'))
        .map((name) => name.replace('-ami.jsonl', ''));
    } catch {
      return [];
    }
  }
}
