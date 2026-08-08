import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../redis/redis.service';
import { OperatingModeService } from './operating-mode.service';

const DEFAULT_LKG_DIR = './var/lkg/kcti';
const SCHEMA_VERSION = 1;
const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const CONFIG_TYPE_RE = /^[a-z_]{1,32}$/;

/** 이름에 이런 조각이 들어간 필드는 값을 남기지 않는다. */
const SECRET_KEY_PATTERN = /(password|secret|token|credential|privatekey|apikey)/i;
const REDACTED = '***REDACTED***';

export type ConfigType = 'queue' | 'routing' | 'permission' | 'feature_flag' | 'pbx';

export interface ConfigSnapshot {
  tenantId: string;
  configType: string;
  version: number;
  schemaVersion: number;
  generatedAt: string;
  checksum: string;
  payload: Record<string, unknown>;
}

/**
 * 검증된 마지막 정상 설정(LKG)을 3계층으로 유지한다.
 *
 *   L1 메모리  — 평시 조회
 *   L2 Redis   — 같은 테넌트를 보는 다른 노드와 공유
 *   L3 로컬 파일 — DB·Redis 가 동시에 죽고 프로세스가 재시작해도 살아남는 최후 보루
 *
 * 로컬 파일은 체크섬을 함께 저장하고 읽을 때 재검증한다. 손상되거나 변조된 설정으로
 * PBX 를 렌더링하는 것이 설정을 아예 못 읽는 것보다 위험하다.
 */
@Injectable()
export class ConfigSnapshotService {
  private readonly logger = new Logger(ConfigSnapshotService.name);
  private readonly dir: string;
  private readonly memory = new Map<string, ConfigSnapshot>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly operatingMode: OperatingModeService,
  ) {
    this.dir = resolve(this.config.get<string>('RESILIENCE_LKG_DIR', DEFAULT_LKG_DIR));
  }

  private key(tenantId: string, configType: string): string {
    if (!UUID_RE.test(tenantId ?? '')) {
      throw new Error(`invalid tenantId for LKG: ${tenantId}`);
    }
    if (!CONFIG_TYPE_RE.test(configType ?? '')) {
      throw new Error(`invalid configType for LKG: ${configType}`);
    }
    return `${tenantId}.${configType}`;
  }

  private filePath(tenantId: string, configType: string): string {
    return join(this.dir, `${this.key(tenantId, configType)}.json`);
  }

  private redisKey(tenantId: string, configType: string): string {
    return `kcti:lkg:${this.key(tenantId, configType)}`;
  }

  /**
   * 키 순서에 무관한 정규 직렬화 위에서 sha256 을 계산한다.
   * JSON.stringify 를 그대로 쓰면 같은 설정이 키 순서만 달라도 다른 체크섬이 나온다.
   */
  computeChecksum(payload: unknown): string {
    return createHash('sha256').update(canonicalize(payload)).digest('hex');
  }

  /** 비밀 값이 LKG 파일과 Redis 에 원문으로 남지 않게 한다. */
  private redact(payload: unknown): unknown {
    if (Array.isArray(payload)) return payload.map((item) => this.redact(item));
    if (payload && typeof payload === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
        out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : this.redact(value);
      }
      return out;
    }
    return payload;
  }

  /**
   * 새 설정 버전을 만들고 3계층 전부에 반영한다.
   * DB 기록이 실패해도 로컬 LKG 는 남긴다 — 장애 중에도 LKG 는 갱신돼야 한다.
   */
  async save(
    tenantId: string,
    configType: ConfigType | string,
    payload: Record<string, unknown>,
    createdByAgentId?: string | null,
  ): Promise<ConfigSnapshot> {
    const safePayload = this.redact(payload) as Record<string, unknown>;
    const version = (await this.resolveNextVersion(tenantId, configType));
    const snapshot: ConfigSnapshot = {
      tenantId,
      configType,
      version,
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      checksum: this.computeChecksum(safePayload),
      payload: safePayload,
    };

    // 원장은 DB. 실패해도 아래 캐시 계층 갱신은 계속한다.
    try {
      await (this.prisma as any).configVersions.create({
        data: {
          tenantId,
          configType,
          version: snapshot.version,
          schemaVersion: snapshot.schemaVersion,
          payload: snapshot.payload as any,
          checksum: snapshot.checksum,
          generatedAt: new Date(snapshot.generatedAt),
          createdByAgentId: createdByAgentId ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(`configVersions insert failed (LKG still updated): ${(err as Error).message}`);
    }

    this.memory.set(this.key(tenantId, configType), snapshot);

    try {
      await this.redis
        .getClient()
        .set(this.redisKey(tenantId, configType), JSON.stringify(snapshot));
    } catch (err) {
      this.logger.warn(`redis LKG write failed: ${(err as Error).message}`);
    }

    await this.writeLocal(snapshot);
    this.operatingMode.reportConfigSource('fresh');
    return snapshot;
  }

  private async resolveNextVersion(tenantId: string, configType: string): Promise<number> {
    const cached = this.memory.get(this.key(tenantId, configType));
    if (cached) return cached.version + 1;

    try {
      const latest = await (this.prisma as any).configVersions.findFirst({
        where: { tenantId, configType },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      if (latest?.version) return Number(latest.version) + 1;
    } catch {
      // DB 를 못 읽으면 로컬 LKG 의 버전을 이어 쓴다.
    }

    const local = await this.readLocal(tenantId, configType).catch(() => null);
    return (local?.version ?? 0) + 1;
  }

  /** temp + rename. 반쯤 쓰인 LKG 파일이 남으면 부팅이 막힌다. */
  private async writeLocal(snapshot: ConfigSnapshot): Promise<void> {
    const path = this.filePath(snapshot.tenantId, snapshot.configType);
    const tmp = `${path}.tmp`;
    try {
      await fs.mkdir(this.dir, { recursive: true });
      await fs.writeFile(tmp, JSON.stringify(snapshot), 'utf8');
      await fs.rename(tmp, path);
    } catch (err) {
      this.logger.error(`local LKG write failed for ${path}: ${(err as Error).message}`);
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      throw err;
    }
  }

  private async readLocal(tenantId: string, configType: string): Promise<ConfigSnapshot | null> {
    try {
      const raw = await fs.readFile(this.filePath(tenantId, configType), 'utf8');
      return JSON.parse(raw) as ConfigSnapshot;
    } catch {
      return null;
    }
  }

  /** 로컬 LKG 를 읽고 체크섬을 재검증한다. 불일치는 즉시 에러다. */
  async loadLocalLkg(tenantId: string, configType: string): Promise<ConfigSnapshot | null> {
    const snapshot = await this.readLocal(tenantId, configType);
    if (!snapshot) return null;

    if (this.computeChecksum(snapshot.payload) !== snapshot.checksum) {
      throw new Error(
        `LKG_CHECKSUM_MISMATCH tenant=${tenantId} configType=${configType} version=${snapshot.version}`,
      );
    }
    return snapshot;
  }

  /** L1 → L2 → L3. 어디서 읽었는지를 operating mode 에 보고한다. */
  async load(tenantId: string, configType: string): Promise<ConfigSnapshot | null> {
    const cached = this.memory.get(this.key(tenantId, configType));
    if (cached) {
      this.operatingMode.reportConfigSource('fresh');
      return cached;
    }

    try {
      const raw = await this.redis.getClient().get(this.redisKey(tenantId, configType));
      if (raw) {
        const snapshot = JSON.parse(raw) as ConfigSnapshot;
        this.memory.set(this.key(tenantId, configType), snapshot);
        this.operatingMode.reportConfigSource('fresh');
        return snapshot;
      }
    } catch (err) {
      this.logger.warn(`redis LKG read failed: ${(err as Error).message}`);
    }

    try {
      const snapshot = await this.loadLocalLkg(tenantId, configType);
      if (snapshot) {
        this.memory.set(this.key(tenantId, configType), snapshot);
        this.operatingMode.reportConfigSource('lkg');
        return snapshot;
      }
    } catch (err) {
      // 체크섬 불일치. 손상된 설정으로 PBX 를 렌더링하느니 없는 것으로 취급한다.
      this.logger.error((err as Error).message);
    }

    this.operatingMode.reportConfigSource('missing');
    return null;
  }

  /** readiness 판정용. 유효 LKG 가 없으면 트래픽을 받지 않는다. */
  async hasValidLkg(tenantId: string, configType: string): Promise<boolean> {
    if (this.memory.has(this.key(tenantId, configType))) return true;
    return (await this.loadLocalLkg(tenantId, configType).catch(() => null)) !== null;
  }

  async getLkgAgeSeconds(tenantId: string, configType: string): Promise<number | null> {
    const snapshot =
      this.memory.get(this.key(tenantId, configType))
      ?? (await this.loadLocalLkg(tenantId, configType).catch(() => null));
    if (!snapshot) return null;
    return Math.max(0, Math.floor((Date.now() - new Date(snapshot.generatedAt).getTime()) / 1000));
  }
}

/** 키를 정렬해 직렬화한다. 체크섬이 키 순서에 흔들리지 않게 하는 유일한 목적. */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
}
