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

  async readPending(tenantId: string): Promise<LocalPendingResult> {
    const cursor = await this.readCursor(tenantId);
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(this.filePath(tenantId));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { records: [], nextOffset: 0 };
      }
      throw err;
    }

    if (cursor >= buffer.length) {
      return { records: [], nextOffset: buffer.length };
    }

    const records: SpoolRecord[] = [];
    for (const line of buffer.subarray(cursor).toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line) as SpoolRecord);
      } catch {
        // 프로세스가 write 중간에 죽어 잘린 줄. 건너뛰고 나머지를 살린다.
        this.logger.warn(`skipping corrupt spool line for tenant=${tenantId}`);
      }
    }

    return { records, nextOffset: buffer.length };
  }

  async pendingCount(tenantId: string): Promise<number> {
    const { records } = await this.readPending(tenantId);
    return records.length;
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
