import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { ArsHttpLookupService } from './ars-http-lookup.service';
import { encryptEndpointSecret, loadEndpointSecretKey } from './endpoint-secret.util';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ENDPOINT_ID = '00000000-0000-0000-0000-0000000000e1';
const HEX_KEY = 'c'.repeat(64);

const ENDPOINT = {
  endpointId: ENDPOINT_ID,
  tenantId: TENANT_ID,
  name: 'CRM 등급조회',
  method: 'GET',
  url: 'https://api.example.com/grade',
  requestMapping: { phone: 'CALLER' },
  authType: 'NONE',
  authHeaderName: null,
  authSecretEnc: null,
  resultPath: 'data.grade',
  matchMode: 'EXISTS',
  matchValue: null,
  timeoutMs: 2000,
  isActive: true,
};

const VARS = { caller: '01012345678', collected: '', entryDid: '16001234', linkedid: '1.2' };

function buildService(options: {
  endpoint?: Record<string, unknown> | null;
  env?: Record<string, string>;
} = {}) {
  const prisma = {
    arsHttpEndpoints: {
      findFirst: jest.fn().mockResolvedValue(options.endpoint === undefined ? ENDPOINT : options.endpoint),
    },
  } as unknown as PrismaService;

  const env: Record<string, string> = {
    ARS_HTTP_LOOKUP_ENABLED: 'true',
    ARS_HTTP_SECRET_KEY: HEX_KEY,
    ...options.env,
  };
  const config = { get: (key: string, fallback?: string) => env[key] ?? fallback } as unknown as ConfigService;

  const service = new ArsHttpLookupService(prisma, config);
  // 이름 해석은 항상 공인 주소를 준다. 주소 검사 자체는 safe-target spec 이 본다.
  (service as any).resolveAddresses = async () => ['93.184.216.34'];
  return { service, prisma };
}

function jsonResponse(body: unknown, status = 200) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => String(Buffer.byteLength(text)) },
    body: null,
    text: async () => text,
  } as unknown as Response;
}

describe('ArsHttpLookupService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('응답에서 값을 꺼내 MATCH 를 준다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any)
      .mockResolvedValue(jsonResponse({ data: { grade: 'VIP' } }));
    const { service } = buildService();

    const result = await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

    expect(result.status).toBe('MATCH');
    expect(result.value).toBe('VIP');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/grade?phone=01012345678');
  });

  it('마스터 스위치가 꺼져 있으면 외부를 부르지 않는다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue(jsonResponse({}));
    const { service } = buildService({ env: { ARS_HTTP_LOOKUP_ENABLED: 'false' } });

    const result = await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

    expect(result.status).toBe('ERROR');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('엔드포인트가 없거나 꺼져 있으면 ERROR 다', async () => {
    const { service } = buildService({ endpoint: null });

    const result = await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

    expect(result.status).toBe('ERROR');
    expect(result.reason).toMatch(/endpoint/i);
  });

  it('테넌트를 조건에 넣는다', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue(jsonResponse({ data: { grade: 'VIP' } }));
    const { service, prisma } = buildService();

    await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

    expect((prisma as any).arsHttpEndpoints.findFirst.mock.calls[0][0].where)
      .toMatchObject({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, isActive: true });
  });

  it('Bearer 자격증명을 복호해서 붙인다', async () => {
    const key = loadEndpointSecretKey(HEX_KEY);
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue(jsonResponse({ data: { grade: 'A' } }));
    const { service } = buildService({
      endpoint: { ...ENDPOINT, authType: 'BEARER', authSecretEnc: encryptEndpointSecret('sk-live-1', key) },
    });

    await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-live-1');
  });

  it('헤더 방식은 지정한 이름으로 넣는다', async () => {
    const key = loadEndpointSecretKey(HEX_KEY);
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue(jsonResponse({ data: { grade: 'A' } }));
    const { service } = buildService({
      endpoint: {
        ...ENDPOINT,
        authType: 'HEADER',
        authHeaderName: 'x-api-key',
        authSecretEnc: encryptEndpointSecret('secret-1', key),
      },
    });

    await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('secret-1');
  });

  it('리다이렉트를 따라가지 않는다 — 검사한 주소를 우회하는 가장 쉬운 길이다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue(jsonResponse('', 302));
    const { service } = buildService();

    const result = await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

    expect((fetchMock.mock.calls[0][1] as RequestInit).redirect).toBe('manual');
    expect(result.status).toBe('ERROR');
    expect(result.reason).toMatch(/redirect/i);
  });

  it('타임아웃 상한을 5초로 묶는다 — 통화가 기다리는 시간이다', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue(jsonResponse({ data: { grade: 'A' } }));
    const { service } = buildService({ endpoint: { ...ENDPOINT, timeoutMs: 99_000 } });

    const result = await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

    expect(result.timeoutMs).toBe(5000);
  });

  it('연속 실패가 쌓이면 외부를 아예 부르지 않는다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue(jsonResponse('boom', 500));
    const { service } = buildService();

    for (let i = 0; i < 5; i += 1) {
      await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });
    }
    expect(fetchMock).toHaveBeenCalledTimes(5);

    const blocked = await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(blocked.status).toBe('ERROR');
    expect(blocked.reason).toMatch(/breaker/i);
  });

  it('성공하면 차단기가 열리지 않는다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any);
    fetchMock.mockResolvedValue(jsonResponse('boom', 500));
    const { service } = buildService();

    for (let i = 0; i < 4; i += 1) {
      await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });
    }
    fetchMock.mockResolvedValue(jsonResponse({ data: { grade: 'A' } }));
    await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });
    fetchMock.mockResolvedValue(jsonResponse('boom', 500));
    for (let i = 0; i < 4; i += 1) {
      await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });
    }

    expect(fetchMock).toHaveBeenCalledTimes(9);
  });

  it('본문이 상한을 넘으면 읽지 않고 ERROR 다', async () => {
    const huge = 'x'.repeat(70_000);
    jest.spyOn(global, 'fetch' as any).mockResolvedValue(jsonResponse(huge));
    const { service } = buildService();

    const result = await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

    expect(result.status).toBe('ERROR');
    expect(result.reason).toMatch(/large|size/i);
  });

  it('요청 매핑이 잘못돼 있으면 외부를 부르지 않고 ERROR 다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue(jsonResponse({}));
    const { service } = buildService({ endpoint: { ...ENDPOINT, requestMapping: { x: 'CUSTOMER_NAME' } } });

    const result = await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

    expect(result.status).toBe('ERROR');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('자격증명은 결과에 담기지 않는다', async () => {
    const key = loadEndpointSecretKey(HEX_KEY);
    jest.spyOn(global, 'fetch' as any).mockResolvedValue(jsonResponse('nope', 401));
    const { service } = buildService({
      endpoint: { ...ENDPOINT, authType: 'BEARER', authSecretEnc: encryptEndpointSecret('sk-live-1', key) },
    });

    const result = await service.lookup({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID, vars: VARS });

    expect(JSON.stringify(result)).not.toContain('sk-live-1');
  });
});
