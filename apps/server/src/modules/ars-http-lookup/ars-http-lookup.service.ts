import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as dns } from 'dns';
import { PrismaService } from '../../common/prisma.service';
import { CircuitBreaker } from './circuit-breaker';
import { decryptEndpointSecret, loadEndpointSecretKey } from './endpoint-secret.util';
import { applyRequest, buildRequestParams, LookupVariables } from './request-mapping.util';
import { extractLookupResult, LookupStatus, MatchMode } from './response-extract.util';
import { assertSafeTarget } from './safe-target.util';

/** 통화가 기다리는 시간이다. 엔드포인트가 무엇을 적었든 여기서 묶는다. */
const MAX_TIMEOUT_MS = 5000;
const DEFAULT_TIMEOUT_MS = 2000;
/** 통화 중에 큰 본문을 버퍼링하지 않는다. */
const MAX_BODY_BYTES = 64 * 1024;
/** 느린 외부 하나가 소켓과 이벤트 루프를 다 먹지 않게 한다. */
const MAX_CONCURRENCY = 20;

export interface LookupInput {
  tenantId: string;
  endpointId: string;
  vars: LookupVariables;
}

export interface LookupOutcome {
  status: LookupStatus;
  value: string;
  reason?: string;
  httpStatus?: number;
  timeoutMs?: number;
  durationMs: number;
}

/**
 * 통화 중 외부 조회를 수행한다.
 *
 * **실패는 예외가 아니라 결과다.** 이 서비스는 던지지 않고 항상 `LookupOutcome` 을 준다 —
 * 부르는 쪽(P2 의 AGI)이 그것을 `FALSE` 간선으로 바꾼다. 미들웨어 사정으로 통화가 멈추면 안 된다.
 *
 * 통화 중에는 **재시도하지 않는다**. 재시도는 고객 대기를 배로 늘린다. 실패의 답은 폴백 분기다.
 */
@Injectable()
export class ArsHttpLookupService {
  private readonly logger = new Logger(ArsHttpLookupService.name);
  private readonly breaker = new CircuitBreaker();
  private readonly inFlight = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async lookup(input: LookupInput): Promise<LookupOutcome> {
    const startedAt = Date.now();
    const fail = (reason: string, extra: Partial<LookupOutcome> = {}): LookupOutcome => ({
      status: 'ERROR',
      value: '',
      reason,
      durationMs: Date.now() - startedAt,
      ...extra,
    });

    if (!this.isEnabled()) {
      return fail('ARS_HTTP_LOOKUP_ENABLED is false');
    }

    const endpoint = await (this.prisma as any).arsHttpEndpoints.findFirst({
      where: { tenantId: input.tenantId, endpointId: input.endpointId, isActive: true },
    });
    if (!endpoint) {
      return fail(`endpoint not found or inactive: ${input.endpointId}`);
    }

    if (!this.breaker.canRequest(endpoint.endpointId)) {
      return fail('circuit breaker is open for this endpoint');
    }
    if (!this.acquireSlot(endpoint.endpointId)) {
      return fail('too many concurrent lookups for this endpoint');
    }

    const timeoutMs = Math.min(Number(endpoint.timeoutMs) || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    try {
      return await this.perform(endpoint, input.vars, timeoutMs, startedAt);
    } catch (error) {
      this.breaker.recordFailure(endpoint.endpointId);
      const message = describe(error);
      this.logger.warn(`ars http lookup failed endpoint=${endpoint.endpointId}: ${message}`);
      return fail(message, { timeoutMs });
    } finally {
      this.releaseSlot(endpoint.endpointId);
    }
  }

  private async perform(
    endpoint: any,
    vars: LookupVariables,
    timeoutMs: number,
    startedAt: number,
  ): Promise<LookupOutcome> {
    // 등록 때만 검사하면 나중에 DNS 를 바꿔치기해 우회할 수 있다. 호출 시점에도 본다.
    const target = await assertSafeTarget(endpoint.url, (hostname) => this.resolveAddresses(hostname));
    const params = buildRequestParams(endpoint.requestMapping, vars);
    const method = endpoint.method === 'POST' ? 'POST' : 'GET';
    const request = applyRequest(target.url, method, params);

    const response = await fetch(request.url, {
      method,
      headers: this.buildHeaders(endpoint, method),
      ...(request.body ? { body: request.body } : {}),
      // 따라가면 검사한 주소 밖으로 나간다.
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    const done = (outcome: Omit<LookupOutcome, 'durationMs'>): LookupOutcome => ({
      ...outcome,
      timeoutMs,
      durationMs: Date.now() - startedAt,
    });

    if (response.status >= 300 && response.status < 400) {
      this.breaker.recordFailure(endpoint.endpointId);
      return done({ status: 'ERROR', value: '', reason: 'endpoint answered with a redirect', httpStatus: response.status });
    }
    if (!response.ok) {
      this.breaker.recordFailure(endpoint.endpointId);
      return done({ status: 'ERROR', value: '', reason: `endpoint returned ${response.status}`, httpStatus: response.status });
    }

    const text = await readCapped(response, MAX_BODY_BYTES);
    if (text === null) {
      this.breaker.recordFailure(endpoint.endpointId);
      return done({ status: 'ERROR', value: '', reason: 'response body is too large', httpStatus: response.status });
    }

    // 여기까지 왔으면 엔드포인트는 살아 있다. NOMATCH 는 정상 결과이므로 성공으로 친다.
    this.breaker.recordSuccess(endpoint.endpointId);

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return done({ status: 'ERROR', value: '', reason: 'response body is not JSON', httpStatus: response.status });
    }

    const extracted = extractLookupResult({
      body,
      resultPath: endpoint.resultPath,
      matchMode: (endpoint.matchMode ?? 'EXISTS') as MatchMode,
      matchValue: endpoint.matchValue ?? null,
    });

    return done({ ...extracted, httpStatus: response.status });
  }

  private buildHeaders(endpoint: any, method: 'GET' | 'POST'): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (method === 'POST') headers['Content-Type'] = 'application/json';

    if (endpoint.authType === 'NONE' || !endpoint.authSecretEnc) return headers;

    const key = loadEndpointSecretKey(this.config.get<string>('ARS_HTTP_SECRET_KEY'));
    const secret = decryptEndpointSecret(endpoint.authSecretEnc, key);

    if (endpoint.authType === 'BEARER') {
      headers.Authorization = `Bearer ${secret}`;
    } else if (endpoint.authType === 'HEADER' && endpoint.authHeaderName) {
      headers[endpoint.authHeaderName] = secret;
    }
    return headers;
  }

  /** `dns.lookup` 을 쓴다 — fetch 가 실제로 쓰는 것과 같은 해석기여야 검사가 의미를 갖는다. */
  private async resolveAddresses(hostname: string): Promise<string[]> {
    const records = await dns.lookup(hostname, { all: true });
    return records.map((record) => record.address);
  }

  private isEnabled(): boolean {
    return (this.config.get<string>('ARS_HTTP_LOOKUP_ENABLED', 'false') ?? 'false').trim().toLowerCase() === 'true';
  }

  private acquireSlot(endpointId: string): boolean {
    const current = this.inFlight.get(endpointId) ?? 0;
    if (current >= MAX_CONCURRENCY) return false;
    this.inFlight.set(endpointId, current + 1);
    return true;
  }

  private releaseSlot(endpointId: string): void {
    const current = this.inFlight.get(endpointId) ?? 0;
    if (current <= 1) this.inFlight.delete(endpointId);
    else this.inFlight.set(endpointId, current - 1);
  }
}

/**
 * 본문을 상한까지만 읽는다.
 *
 * `response.text()` 는 크기와 무관하게 전부 버퍼링한다. 통화가 붙어 있는 경로에서
 * 남이 정하는 크기를 그대로 받아들이면 안 된다.
 */
async function readCapped(response: Response, cap: number): Promise<string | null> {
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > cap) return null;

  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    return Buffer.byteLength(text) > cap ? null : text;
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** `instanceof Error` 를 쓰지 않는다 — undici 오류는 realm 이 다르면 거짓이 된다. */
function describe(error: unknown): string {
  const node = error as { message?: unknown; name?: unknown };
  if (node?.name === 'TimeoutError') return 'lookup timed out';
  return typeof node?.message === 'string' ? node.message : String(error);
}
