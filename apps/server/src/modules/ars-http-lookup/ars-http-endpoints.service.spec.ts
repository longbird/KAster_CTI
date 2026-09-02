import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { ArsHttpEndpointsService } from './ars-http-endpoints.service';
import { ArsHttpLookupService } from './ars-http-lookup.service';
import { decryptEndpointSecret, loadEndpointSecretKey } from './endpoint-secret.util';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ENDPOINT_ID = '00000000-0000-0000-0000-0000000000e1';
const HEX_KEY = 'd'.repeat(64);
const KEY = loadEndpointSecretKey(HEX_KEY);

const ROW = {
  endpointId: ENDPOINT_ID,
  tenantId: TENANT_ID,
  name: 'CRM',
  description: null,
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

const VALID = {
  name: 'CRM',
  url: 'https://api.example.com/grade',
  requestMapping: { phone: 'CALLER' },
  resultPath: 'data.grade',
};

function buildService(options: { row?: Record<string, unknown> | null } = {}) {
  const state = { created: [] as any[], updated: [] as any[] };
  const prisma = {
    arsHttpEndpoints: {
      findMany: jest.fn().mockResolvedValue([{ ...ROW, authSecretEnc: 'cipher' }]),
      findFirst: jest.fn().mockResolvedValue(options.row === undefined ? ROW : options.row),
      create: jest.fn().mockImplementation(async (args: any) => {
        state.created.push(args.data);
        return { ...ROW, ...args.data };
      }),
      update: jest.fn().mockImplementation(async (args: any) => {
        state.updated.push(args.data);
        return { ...ROW, ...args.data };
      }),
      delete: jest.fn().mockResolvedValue(ROW),
    },
  } as unknown as PrismaService;

  const config = {
    get: (key: string, fallback?: string) => ({ ARS_HTTP_SECRET_KEY: HEX_KEY }[key] ?? fallback),
  } as unknown as ConfigService;

  const lookup = { lookup: jest.fn().mockResolvedValue({ status: 'MATCH', value: 'VIP', durationMs: 12 }) };
  const service = new ArsHttpEndpointsService(prisma, config, lookup as unknown as ArsHttpLookupService);
  // 주소 검사 자체는 safe-target spec 이 본다. 여기서는 DNS 를 타지 않는다.
  (service as any).resolveAddresses = async () => ['93.184.216.34'];

  return { service, prisma, state, lookup };
}

describe('ArsHttpEndpointsService', () => {
  describe('자격증명', () => {
    it('목록에 암호문을 담지 않는다 — 있는지만 알려준다', async () => {
      const { service } = buildService();

      const rows = await service.list(TENANT_ID);

      expect(rows[0].hasSecret).toBe(true);
      expect(rows[0]).not.toHaveProperty('authSecretEnc');
      expect(JSON.stringify(rows)).not.toContain('cipher');
    });

    it('단건 조회도 마찬가지다', async () => {
      const { service } = buildService({ row: { ...ROW, authSecretEnc: 'cipher' } });

      const row = await service.get(TENANT_ID, ENDPOINT_ID);

      expect(row).not.toHaveProperty('authSecretEnc');
      expect(row.hasSecret).toBe(true);
    });

    it('저장할 때 암호화한다 — 평문이 DB 로 가지 않는다', async () => {
      const { service, state } = buildService();

      await service.create(TENANT_ID, { ...VALID, authType: 'BEARER', authSecret: 'sk-live-1' });

      const saved = state.created[0];
      expect(saved.authSecretEnc).not.toContain('sk-live-1');
      expect(decryptEndpointSecret(saved.authSecretEnc, KEY)).toBe('sk-live-1');
    });

    it('수정에서 값을 안 주면 기존 자격증명을 그대로 둔다', async () => {
      const { service, state } = buildService({ row: { ...ROW, authType: 'BEARER', authSecretEnc: 'kept' } });

      await service.update(TENANT_ID, ENDPOINT_ID, { ...VALID, authType: 'BEARER' });

      expect(state.updated[0]).not.toHaveProperty('authSecretEnc');
    });

    it('인증을 NONE 으로 바꾸면 자격증명을 지운다', async () => {
      const { service, state } = buildService({ row: { ...ROW, authType: 'BEARER', authSecretEnc: 'kept' } });

      await service.update(TENANT_ID, ENDPOINT_ID, { ...VALID, authType: 'NONE' });

      expect(state.updated[0].authSecretEnc).toBeNull();
    });

    it('처음 만들 때 인증 방식만 고르고 값을 안 주면 막는다', async () => {
      const { service } = buildService();

      await expect(service.create(TENANT_ID, { ...VALID, authType: 'BEARER' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('검증', () => {
    it('막힌 주소는 등록 시점에 막는다', async () => {
      const { service } = buildService();
      (service as any).resolveAddresses = async () => ['169.254.169.254'];

      await expect(service.create(TENANT_ID, VALID)).rejects.toThrow(/169\.254\.169\.254/);
    });

    it('요청 매핑의 모르는 출처를 막는다', async () => {
      const { service } = buildService();

      await expect(service.create(TENANT_ID, { ...VALID, requestMapping: { x: 'CUSTOMER_NAME' } }))
        .rejects.toThrow(/CUSTOMER_NAME/);
    });

    it('resultPath 는 점 표기만 받는다', async () => {
      const { service } = buildService();

      await expect(service.create(TENANT_ID, { ...VALID, resultPath: 'data[0].grade' }))
        .rejects.toThrow(/점 표기/);
    });

    it('EQUALS 인데 비교값이 없으면 막는다', async () => {
      const { service } = buildService();

      await expect(service.create(TENANT_ID, { ...VALID, matchMode: 'EQUALS' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('HEADER 인데 헤더 이름이 없으면 막는다', async () => {
      const { service } = buildService();

      await expect(service.create(TENANT_ID, { ...VALID, authType: 'HEADER', authSecret: 'x' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('타임아웃을 5초로 묶는다 — 통화가 기다리는 시간이다', async () => {
      const { service, state } = buildService();

      await service.create(TENANT_ID, { ...VALID, timeoutMs: 60_000 });

      expect(state.created[0].timeoutMs).toBe(5000);
    });

    it('모르는 method 를 막는다', async () => {
      const { service } = buildService();

      await expect(service.create(TENANT_ID, { ...VALID, method: 'DELETE' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('테스트 호출', () => {
    it('통화 경로와 같은 서비스를 탄다', async () => {
      const { service, lookup } = buildService();

      const result = await service.test(TENANT_ID, ENDPOINT_ID, { collected: '20260902' });

      expect(lookup.lookup).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        endpointId: ENDPOINT_ID,
        vars: expect.objectContaining({ collected: '20260902' }),
      });
      expect(result.status).toBe('MATCH');
    });

    it('없는 엔드포인트는 404 다', async () => {
      const { service } = buildService({ row: null });

      await expect(service.test(TENANT_ID, ENDPOINT_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('테넌트 밖의 엔드포인트는 못 본다', async () => {
    const { service, prisma } = buildService();

    await service.get(TENANT_ID, ENDPOINT_ID);

    expect((prisma as any).arsHttpEndpoints.findFirst.mock.calls[0][0].where)
      .toMatchObject({ tenantId: TENANT_ID, endpointId: ENDPOINT_ID });
  });
});
