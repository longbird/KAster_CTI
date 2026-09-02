import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as dns } from 'dns';
import { PrismaService } from '../../common/prisma.service';
import { ArsHttpLookupService, LookupOutcome } from './ars-http-lookup.service';
import { encryptEndpointSecret, loadEndpointSecretKey } from './endpoint-secret.util';
import { buildRequestParams } from './request-mapping.util';
import { assertSafeTarget } from './safe-target.util';

const METHODS = ['GET', 'POST'];
const AUTH_TYPES = ['NONE', 'BEARER', 'HEADER'];
const MATCH_MODES = ['EXISTS', 'EQUALS', 'IN'];
const RESULT_PATH = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,255}$/;
const MIN_TIMEOUT_MS = 500;
const MAX_TIMEOUT_MS = 5000;

/** 매핑 검사에만 쓰는 값. 실제 통화 값이 아니다. */
const SAMPLE_VARS = {
  caller: '01000000000',
  collected: '00000000',
  entryDid: '0000000000',
  linkedid: '0.0',
};

export interface EndpointInput {
  name: string;
  description?: string | null;
  method?: string;
  url: string;
  requestMapping?: unknown;
  authType?: string;
  authHeaderName?: string | null;
  /** 평문. 저장 전에 암호화한다. `undefined` 면 기존 값을 유지하고 `''` 면 지운다. */
  authSecret?: string | null;
  resultPath: string;
  matchMode?: string;
  matchValue?: string | null;
  timeoutMs?: number;
  isActive?: boolean;
}

/**
 * 외부 조회 엔드포인트 레지스트리.
 *
 * URL 을 플로우 노드에 적지 못하게 하려고 존재한다 — 임의 URL 을 적을 수 있으면 PBX 망 안에서
 * 아무 데나 부를 수 있고, 그래프는 미리보기·diff·백업으로 복사되므로 자격증명이 거기 있으면 안 된다.
 *
 * **자격증명은 어떤 응답으로도 나가지 않는다.** 있는지 없는지만 알려준다.
 */
@Injectable()
export class ArsHttpEndpointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly lookup: ArsHttpLookupService,
  ) {}

  async list(tenantId: string) {
    const rows = await (this.prisma as any).arsHttpEndpoints.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return rows.map(toPublic);
  }

  async get(tenantId: string, endpointId: string) {
    return toPublic(await this.loadOrThrow(tenantId, endpointId));
  }

  async create(tenantId: string, input: EndpointInput) {
    const data = await this.normalize(input, { requireSecret: true });
    const created = await (this.prisma as any).arsHttpEndpoints.create({
      data: { tenantId, ...data },
    });
    return toPublic(created);
  }

  async update(tenantId: string, endpointId: string, input: EndpointInput) {
    const existing = await this.loadOrThrow(tenantId, endpointId);
    const data = await this.normalize(input, {
      requireSecret: !existing.authSecretEnc,
    });
    const updated = await (this.prisma as any).arsHttpEndpoints.update({
      where: { endpointId },
      data,
    });
    return toPublic(updated);
  }

  async remove(tenantId: string, endpointId: string) {
    await this.loadOrThrow(tenantId, endpointId);
    await (this.prisma as any).arsHttpEndpoints.delete({ where: { endpointId } });
    return { deleted: true, endpointId };
  }

  /**
   * 등록한 그대로 한 번 불러본다.
   *
   * 통화 경로와 **같은 서비스**를 탄다 — 차단기·타임아웃·값 깎기까지 똑같이 겪어야
   * 전화를 걸기 전에 진짜 문제를 본다.
   */
  async test(
    tenantId: string,
    endpointId: string,
    vars: Partial<typeof SAMPLE_VARS> = {},
  ): Promise<LookupOutcome> {
    await this.loadOrThrow(tenantId, endpointId);
    return this.lookup.lookup({
      tenantId,
      endpointId,
      vars: { ...SAMPLE_VARS, ...vars },
    });
  }

  private async normalize(input: EndpointInput, options: { requireSecret: boolean }) {
    const name = requiredText(input.name, 'name');
    const method = pick(input.method ?? 'GET', METHODS, 'method');
    const authType = pick(input.authType ?? 'NONE', AUTH_TYPES, 'authType');
    const matchMode = pick(input.matchMode ?? 'EXISTS', MATCH_MODES, 'matchMode');
    const resultPath = requiredText(input.resultPath, 'resultPath');

    if (!RESULT_PATH.test(resultPath)) {
      throw new BadRequestException('resultPath 는 점 표기만 받습니다 (예: data.customer.grade)');
    }

    // 등록 시점에도 주소를 검사한다. 여기서 막지 않으면 통화 중에 처음 알게 된다.
    await this.assertUrl(input.url);

    try {
      buildRequestParams(input.requestMapping ?? {}, SAMPLE_VARS);
    } catch (error) {
      throw new BadRequestException(`requestMapping 이 올바르지 않습니다: ${messageOf(error)}`);
    }

    if (matchMode !== 'EXISTS' && !String(input.matchValue ?? '').trim()) {
      throw new BadRequestException(`matchMode=${matchMode} 이면 matchValue 가 필요합니다.`);
    }
    if (authType === 'HEADER' && !String(input.authHeaderName ?? '').trim()) {
      throw new BadRequestException('authType=HEADER 이면 authHeaderName 이 필요합니다.');
    }

    const data: Record<string, unknown> = {
      name,
      description: input.description ?? null,
      method,
      url: input.url.trim(),
      requestMapping: (input.requestMapping ?? {}) as any,
      authType,
      authHeaderName: authType === 'HEADER' ? String(input.authHeaderName).trim() : null,
      resultPath,
      matchMode,
      matchValue: matchMode === 'EXISTS' ? null : String(input.matchValue).trim(),
      timeoutMs: clampTimeout(input.timeoutMs),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    };

    Object.assign(data, this.resolveSecret(input.authSecret, authType, options.requireSecret));
    return data;
  }

  /** `undefined` 면 그대로 두고, 빈 문자열이면 지우고, 값이 있으면 암호화한다. */
  private resolveSecret(
    authSecret: string | null | undefined,
    authType: string,
    requireSecret: boolean,
  ): Record<string, unknown> {
    if (authType === 'NONE') {
      return { authSecretEnc: null };
    }

    if (authSecret === undefined) {
      if (requireSecret) {
        throw new BadRequestException(`authType=${authType} 이면 인증 값이 필요합니다.`);
      }
      return {};
    }

    const plain = String(authSecret ?? '');
    if (!plain) {
      throw new BadRequestException(`authType=${authType} 이면 인증 값을 비울 수 없습니다.`);
    }

    const key = loadEndpointSecretKey(this.config.get<string>('ARS_HTTP_SECRET_KEY'));
    return { authSecretEnc: encryptEndpointSecret(plain, key) };
  }

  private async assertUrl(url: string) {
    try {
      await assertSafeTarget(String(url ?? ''), (hostname) => this.resolveAddresses(hostname));
    } catch (error) {
      throw new BadRequestException(`엔드포인트 주소를 쓸 수 없습니다: ${messageOf(error)}`);
    }
  }

  private async resolveAddresses(hostname: string): Promise<string[]> {
    const records = await dns.lookup(hostname, { all: true });
    return records.map((record) => record.address);
  }

  private async loadOrThrow(tenantId: string, endpointId: string) {
    const row = await (this.prisma as any).arsHttpEndpoints.findFirst({
      where: { tenantId, endpointId },
    });
    if (!row) {
      throw new NotFoundException(`ars http endpoint not found: ${endpointId}`);
    }
    return row;
  }
}

/** 자격증명을 지우고 존재 여부만 남긴다. 이 함수를 거치지 않고 응답을 만들지 않는다. */
function toPublic(row: any) {
  const { authSecretEnc, ...rest } = row;
  return { ...rest, hasSecret: Boolean(authSecretEnc) };
}

function requiredText(value: unknown, field: string): string {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new BadRequestException(`${field} 가 필요합니다.`);
  }
  return text;
}

function pick(value: string, allowed: string[], field: string): string {
  const upper = String(value ?? '').trim().toUpperCase();
  if (!allowed.includes(upper)) {
    throw new BadRequestException(`${field} 는 ${allowed.join(' / ')} 중 하나여야 합니다.`);
  }
  return upper;
}

function clampTimeout(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 2000;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(parsed)));
}

function messageOf(error: unknown): string {
  const node = error as { message?: unknown };
  return typeof node?.message === 'string' ? node.message : String(error);
}
