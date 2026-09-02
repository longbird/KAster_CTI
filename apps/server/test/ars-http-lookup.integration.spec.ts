import { ConfigService } from '@nestjs/config';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { PrismaService } from '../src/common/prisma.service';
import { ArsHttpLookupService } from '../src/modules/ars-http-lookup/ars-http-lookup.service';
import {
  encryptEndpointSecret,
  loadEndpointSecretKey,
} from '../src/modules/ars-http-lookup/endpoint-secret.util';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ENDPOINT_ID = '00000000-0000-0000-0000-0000000000e1';
const HEX_KEY = 'e'.repeat(64);
const KEY = loadEndpointSecretKey(HEX_KEY);

const VARS = { caller: '01012345678', collected: '20260902', entryDid: '16001234', linkedid: '1.2' };

/**
 * 진짜 소켓으로 한 번 왕복한다.
 *
 * 단위 테스트는 `fetch` 를 갈아끼우므로 타임아웃이 진짜로 끊는지, 쿼리가 실제로 나가는지를
 * 증명하지 못한다. 통화가 기다리는 경로라 그 둘이 특히 중요하다.
 */
describe('ARS 외부 조회 — HTTP 왕복', () => {
  let server: Server;
  let baseUrl: string;
  let lastRequest: { url: string; headers: IncomingMessage['headers']; body: string };
  let respond: (res: ServerResponse) => void;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk as Buffer));
      req.on('end', () => {
        lastRequest = { url: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks).toString('utf8') };
        respond(res);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function buildService(endpoint: Record<string, unknown>) {
    const prisma = {
      arsHttpEndpoints: { findFirst: jest.fn().mockResolvedValue(endpoint) },
    } as unknown as PrismaService;
    const config = {
      get: (key: string, fallback?: string) =>
        ({ ARS_HTTP_LOOKUP_ENABLED: 'true', ARS_HTTP_SECRET_KEY: HEX_KEY }[key] ?? fallback),
    } as unknown as ConfigService;
    return new ArsHttpLookupService(prisma, config);
  }

  function endpointFor(overrides: Record<string, unknown> = {}) {
    return {
      endpointId: ENDPOINT_ID,
      tenantId: TENANT_ID,
      method: 'GET',
      url: baseUrl,
      requestMapping: { phone: 'CALLER', custNo: 'COLLECTED' },
      authType: 'NONE',
      authHeaderName: null,
      authSecretEnc: null,
      resultPath: 'data.grade',
      matchMode: 'EXISTS',
      matchValue: null,
      timeoutMs: 2000,
      isActive: true,
      ...overrides,
    };
  }

  function replyJson(body: unknown, status = 200) {
    respond = (res) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
  }

  it('127.0.0.1 은 사설이 아니라 막힌 대역이다 — 루프백으로는 조회하지 못한다', async () => {
    replyJson({ data: { grade: 'VIP' } });
    const service = buildService(endpointFor());

    const result = await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

    expect(result.status).toBe('ERROR');
    expect(result.reason).toMatch(/blocked/i);
  });

  describe('주소 검사를 통과한 경우', () => {
    function servicePastGuard(endpoint: Record<string, unknown>) {
      const service = buildService(endpoint);
      // 이름이 사설 대역으로 풀린 상황을 만든다. 검사 자체는 safe-target spec 이 본다.
      (service as any).resolveAddresses = async () => ['10.0.0.5'];
      return service;
    }

    function endpointByName(overrides: Record<string, unknown> = {}) {
      const port = (server.address() as AddressInfo).port;
      // 호스트 이름은 사설로 풀린 것으로 치고, 실제 연결은 loopback 으로 간다.
      return endpointFor({ url: `http://localhost:${port}`, ...overrides });
    }

    it('쿼리스트링이 실제로 나간다', async () => {
      replyJson({ data: { grade: 'VIP' } });
      const service = servicePastGuard(endpointByName());

      const result = await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

      expect(lastRequest.url).toBe('/?phone=01012345678&custNo=20260902');
      expect(result).toMatchObject({ status: 'MATCH', value: 'VIP', httpStatus: 200 });
    });

    it('POST 면 JSON 본문으로 나간다', async () => {
      replyJson({ data: { grade: 'GOLD' } });
      const service = servicePastGuard(endpointByName({ method: 'POST' }));

      await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

      expect(lastRequest.headers['content-type']).toBe('application/json');
      expect(JSON.parse(lastRequest.body)).toEqual({ phone: '01012345678', custNo: '20260902' });
    });

    it('자격증명이 실제 헤더로 나간다', async () => {
      replyJson({ data: { grade: 'VIP' } });
      const service = servicePastGuard(endpointByName({
        authType: 'HEADER',
        authHeaderName: 'x-api-key',
        authSecretEnc: encryptEndpointSecret('secret-1', KEY),
      }));

      await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

      expect(lastRequest.headers['x-api-key']).toBe('secret-1');
    });

    it('없는 등급은 NOMATCH 다 — 오류가 아니다', async () => {
      replyJson({ data: {} });
      const service = servicePastGuard(endpointByName());

      const result = await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

      expect(result).toMatchObject({ status: 'NOMATCH', value: '' });
    });

    it('응답이 없으면 정해둔 시간에 끊는다 — 통화가 기다리는 중이다', async () => {
      respond = () => {
        /* 일부러 응답하지 않는다 */
      };
      const service = servicePastGuard(endpointByName({ timeoutMs: 500 }));

      const startedAt = Date.now();
      const result = await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

      expect(result.status).toBe('ERROR');
      expect(result.reason).toMatch(/timed out/i);
      expect(Date.now() - startedAt).toBeLessThan(2000);
    });

    it('리다이렉트를 따라가지 않는다', async () => {
      respond = (res) => {
        res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' });
        res.end();
      };
      const service = servicePastGuard(endpointByName());

      const result = await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

      expect(result.status).toBe('ERROR');
      expect(result.reason).toMatch(/redirect/i);
    });

    it('큰 본문은 상한에서 끊는다', async () => {
      respond = (res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: { grade: 'x'.repeat(70_000) } }));
      };
      const service = servicePastGuard(endpointByName());

      const result = await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

      expect(result.status).toBe('ERROR');
      expect(result.reason).toMatch(/large/i);
    });

    it('외부가 넣은 위험한 문자열은 ERROR 로 막는다 — dialplan 으로 흘리지 않는다', async () => {
      replyJson({ data: { grade: 'VIP)\nexten => s,1,System(rm -rf /)' } });
      const service = servicePastGuard(endpointByName());

      const result = await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

      expect(result.status).toBe('ERROR');
      expect(result.value).toBe('');
    });
  });
});
